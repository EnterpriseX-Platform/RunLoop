#!/usr/bin/env bash
# Manual deploy for RunLoop — mirrors what Jenkins does but from a dev laptop.
#
# Usage:
#   ./scripts/deploy-prod.sh                     # auto tag
#   ./scripts/deploy-prod.sh my-feature          # custom tag
#   BUILD_ONLY=1 ./scripts/deploy-prod.sh        # build, no push/deploy
#   SKIP_BUILD=1 ./scripts/deploy-prod.sh v1.x   # deploy existing tag
#
# Requires (set as env vars or edit defaults below):
#   • docker (buildx, linux/amd64)
#   • REGISTRY        e.g. ghcr.io/your-org  or  docker.io/your-username
#   • SSH_HOST        e.g. deploy@k8s-master  (must have kubectl + kubeconfig)
#   • NAMESPACE       e.g. runloop
#   • `docker login` to your registry done beforehand
set -euo pipefail

REGISTRY="${REGISTRY:-ghcr.io/enterprisex-platform}"
WEB_IMAGE="${REGISTRY}/runloop-web"
ENG_IMAGE="${REGISTRY}/runloop-engine"
SSH_HOST="${SSH_HOST:-deploy@k8s-master}"
NAMESPACE="${NAMESPACE:-runloop}"

TAG="${1:-v1.$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)}"
WEB_TAGGED="${WEB_IMAGE}:${TAG}"
ENG_TAGGED="${ENG_IMAGE}:${TAG}"

say() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# ── Prechecks ─────────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo "❌ docker not running"; exit 1
fi
if [[ -z "${SKIP_BUILD:-}" ]] && ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" true 2>/dev/null; then
  echo "❌ ssh to $SSH_HOST failed — need key added to authorized_keys"; exit 1
fi

# ── Build ─────────────────────────────────────────────────────────────
if [[ -z "${SKIP_BUILD:-}" ]]; then
  say "Building $WEB_TAGGED"
  docker build --platform linux/amd64 \
    -f apps/runloop/Dockerfile \
    -t "$WEB_TAGGED" -t "${WEB_IMAGE}:latest" \
    apps/runloop

  say "Building $ENG_TAGGED"
  docker build --platform linux/amd64 \
    -f apps/runloop-engine/Dockerfile \
    -t "$ENG_TAGGED" -t "${ENG_IMAGE}:latest" \
    apps/runloop-engine
fi

if [[ -n "${BUILD_ONLY:-}" ]]; then
  say "BUILD_ONLY — stopping before push"
  exit 0
fi

# ── Push ──────────────────────────────────────────────────────────────
if [[ -z "${SKIP_BUILD:-}" ]]; then
  say "Pushing images"
  docker push "$WEB_TAGGED"
  docker push "${WEB_IMAGE}:latest"
  docker push "$ENG_TAGGED"
  docker push "${ENG_IMAGE}:latest"
fi

# ── Deploy ────────────────────────────────────────────────────────────
say "Rolling deployments in ns=$NAMESPACE"
ssh "$SSH_HOST" "kubectl set image deployment/runloop-engine -n $NAMESPACE engine=$ENG_TAGGED"
ssh "$SSH_HOST" "kubectl set image deployment/runloop-web    -n $NAMESPACE web=$WEB_TAGGED migrate=$WEB_TAGGED"

say "Waiting for rollouts"
ssh "$SSH_HOST" "kubectl rollout status deployment/runloop-engine -n $NAMESPACE --timeout=180s"
ssh "$SSH_HOST" "kubectl rollout status deployment/runloop-web    -n $NAMESPACE --timeout=300s"

# ── Smoke test ────────────────────────────────────────────────────────
say "Smoke test"
curl -sk -o /dev/null -w "ingress /runloop      → %{http_code}\n" \
  https://<your-domain>/runloop || true
curl -sk -o /dev/null -w "engine /rl/health     → %{http_code}\n" \
  https://<your-domain>/runloop/rl/health || true

say "✅ Deployed $TAG"
