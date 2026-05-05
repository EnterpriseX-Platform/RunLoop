# RunLoop — Production Deployment Guide

> **Target cluster:** your K8s cluster (`<k8s-master>` master)
> **Namespace:** `runloop` (or whatever you choose)
> **Domain:** `https://<your-domain>/runloop`
> **Jenkins:** `http://<your-jenkins-host>/job/<your-folder>/`

---

## 1. Topology

```
Browser
  │
  ▼  https://<your-domain>/runloop/*
┌────────────────── Ingress (nginx) ──────────────────┐
│  /runloop/rl/ws/* ─┐                                 │
│  /runloop/rl/*   ──┼──▶  runloop-engine  (Go :8080)  │
│  /runloop/*      ───▶    runloop-web     (Next :3000)│
└──────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
     runloop-engine  ◀─── SQL ───▶  runloop-postgres (PG 16)
           ▲
           └── server-side rewrite ──── runloop-web
               ENGINE_URL=http://runloop-engine:8080
```

**Why the split routes:**
- Next.js `basePath: /runloop` serves the UI + proxies `/api/*` server-side to the engine.
- WebSockets (live execution logs) need to reach the engine **directly** from the browser — Next.js doesn't proxy WS. So the Ingress carves out `/runloop/rl/*` to hit the engine pod.

---

## 2. One-time bootstrap (first deploy only)

On the master node:

```bash
# 2.1 Create namespace
ssh <deploy-user>@<k8s-master> 'kubectl create namespace runloop'

# 2.2 Create runloop-secret (do NOT commit real values)
#     DATABASE_URL must NOT contain ?schema=public — pgx (Go engine)
#     rejects unknown parameters.
ssh <deploy-user>@<k8s-master> "kubectl -n runloop create secret generic runloop-secret \
  --from-literal=DATABASE_URL='postgresql://runloop:<PASSWORD>@runloop-postgres:5432/runloop' \
  --from-literal=POSTGRES_PASSWORD='<PASSWORD>' \
  --from-literal=JWT_SECRET='$(openssl rand -hex 32)' \
  --from-literal=SECRETS_KEY='$(openssl rand -hex 16)'"   # SECRETS_KEY = 32 chars exactly

# 2.3 (only if your registry is private) Create an imagePullSecret so the
#     pods can pull your images. Skip this step if you're using ghcr.io
#     public images.
#
# kubectl -n runloop create secret docker-registry runloop-regcred \
#   --docker-server=<your-registry> \
#   --docker-username='<user>' \
#   --docker-password='<pass-or-token>'
#
# Then reference the secret in k8s/30-engine.yaml + k8s/40-web.yaml under
# `imagePullSecrets`. The reference is commented out in the manifests by
# default — uncomment it if you create the secret.

# 2.4 Create the NFS directory for Postgres (PV expects it to exist).
#     Run this once via a bootstrap pod that mounts /datastore:
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: nfs-bootstrap
  namespace: runloop
spec:
  restartPolicy: Never
  containers:
    - name: mkdir
      image: alpine:3
      command: ["sh","-c","mkdir -p /nfs/runloop/postgres && chown 999:999 /nfs/runloop/postgres"]
      volumeMounts: [{ name: nfs, mountPath: /nfs }]
  volumes:
    - name: nfs
      nfs: { server: <nfs-server>, path: /datastore }
EOF
kubectl -n runloop wait --for=condition=Ready pod/nfs-bootstrap --timeout=60s
kubectl -n runloop delete pod nfs-bootstrap

# 2.5 Apply manifests (run from a checkout of this repo on your laptop)
for f in k8s/20-postgres.yaml k8s/30-engine.yaml k8s/40-web.yaml; do
  cat $f | ssh <deploy-user>@<k8s-master> 'kubectl apply -f -'
done
```

---

## 3. Deploy

```bash
# Auto tag (date + git short SHA)
./scripts/deploy-prod.sh

# Custom tag
./scripts/deploy-prod.sh my-feature-v1

# Build only (no push/deploy)
BUILD_ONLY=1 ./scripts/deploy-prod.sh

# Deploy existing tag (skip build + push)
SKIP_BUILD=1 ./scripts/deploy-prod.sh v0.1.0
```

Builds + pushes **both** images then does `kubectl set image` for each
deployment via SSH to the master node.

The script reads `REGISTRY`, `SSH_HOST`, and `NAMESPACE` from env vars —
override the defaults at the top of `scripts/deploy-prod.sh` or export
them in your shell. For CI integration, GitHub Actions can run the same
build + push (see `.github/workflows/release.yml`); the deploy step is
left to your environment-specific tooling.

---

## 4. Verification

```bash
# Pod status
ssh <deploy-user>@<k8s-master> 'kubectl get pod -n runloop -o wide'

# Expected:
# runloop-web-<hash>      2/2 Running
# runloop-engine-<hash>   1/1 Running
# runloop-postgres-<hash> 1/1 Running

# Tail logs
ssh <deploy-user>@<k8s-master> 'kubectl logs -n runloop -l app=runloop-web    --tail=50 -f'
ssh <deploy-user>@<k8s-master> 'kubectl logs -n runloop -l app=runloop-engine --tail=50 -f'

# Ingress health
curl -skI https://<your-domain>/runloop | head -3
# Expect: HTTP/2 307 (redirect to /runloop/dashboard)

# Engine health
curl -sk https://<your-domain>/runloop/rl/health
# Expect: {"status":"ok"}

# Image tag check
ssh <deploy-user>@<k8s-master> \
  'kubectl get deployment -n runloop runloop-web -o jsonpath="{.spec.template.spec.containers[0].image}"'
# Expect: ghcr.io/enterprisex-platform/runloop-web:<your-tag>
```

---

## 5. Rollback

```bash
# Fast path — undo last change
ssh <deploy-user>@<k8s-master> \
  'kubectl rollout undo deployment/runloop-web -n runloop'
ssh <deploy-user>@<k8s-master> \
  'kubectl rollout undo deployment/runloop-engine -n runloop'

# Pin to a specific known-good tag
ssh <deploy-user>@<k8s-master> \
  'kubectl set image deployment/runloop-web -n runloop web=ghcr.io/enterprisex-platform/runloop-web:v1.20260422-deadbee'
```

---

## 6. Common operations

```bash
# Restart (no image change — picks up ConfigMap edits)
ssh <deploy-user>@<k8s-master> 'kubectl rollout restart deployment/runloop-web -n runloop'

# Exec into web pod
ssh -t <deploy-user>@<k8s-master> \
  'kubectl exec -it -n runloop deployment/runloop-web -- sh'

# Prisma Studio via port-forward
ssh -f -N -L 15481:localhost:15481 <deploy-user>@<k8s-master>
ssh <deploy-user>@<k8s-master> \
  "nohup kubectl port-forward -n runloop --address 0.0.0.0 svc/runloop-postgres 15481:5432 > /tmp/runloop-pf.log 2>&1 &"
# Now: PGPASSWORD=<pwd> psql -h localhost -p 15481 -U runloop -d runloop

# Reset DB schema (dev only!)
ssh <deploy-user>@<k8s-master> \
  'kubectl exec -n runloop deploy/runloop-web -- npx prisma db push --force-reset'
```

---

## 7. Troubleshooting

### ❌ `exec format error` in pod
Image built on ARM Mac without `--platform linux/amd64`. Rebuild with the flag — our `scripts/deploy-prod.sh` already sets it.

### ❌ WebSocket disconnects
Browser connects to `wss://<your-domain>/runloop/rl/ws/executions/<id>`. If it fails:
1. Ingress path `/runloop/rl/ws` must come **before** `/runloop` in manifest (order matters).
2. `proxy-read-timeout` must be long (we set 3600s).
3. `useWebSocket.ts` in the app uses `window.location.host` — if hardcoded to a dev port, fix before deploy.

### ❌ Engine can't reach Postgres
Check `DATABASE_URL` in `runloop-secret`. Host must be `runloop-postgres` (the service DNS), not `localhost`.

### ❌ Engine: `unrecognized configuration parameter "schema"`
pgx doesn't accept Prisma's `?schema=public` query param. Strip it from the secret:
```bash
kubectl -n runloop patch secret runloop-secret --type='json' \
  -p='[{"op":"replace","path":"/data/DATABASE_URL","value":"'$(printf 'postgresql://runloop:PASS@runloop-postgres:5432/runloop' | base64)'"}]'
kubectl -n runloop rollout restart deployment/runloop-engine
```

### ❌ Web: ImagePullBackOff `pull access denied`
Either you're pulling from a private registry without a matching imagePullSecret, or the secret in this namespace doesn't have credentials for that registry. See step 2.3 of the bootstrap. Public ghcr.io images don't need a pull secret.

### ❌ Web init: `prisma_schema_build_bg.wasm ENOENT`
Runner image is missing the prisma CLI tree. The current Dockerfile bundles the full `node_modules/prisma` + `@prisma` + `.bin` — if you see this on a fresh build, verify the Dockerfile still has those COPY lines.

### ❌ `prisma db push` hangs in init container
Postgres pod not ready yet — delete the web pod, it'll retry:
```bash
ssh <deploy-user>@<k8s-master> 'kubectl delete pod -n runloop -l app=runloop-web'
```

### ❌ External Apache returns 503 for /runloop
The external Apache vhost for <your-domain> needs upstream
ProxyPass pointing at the NodePorts. Required lines:

```apache
ProxyPass        /runloop/rl/ws/ ws://<k8s-master>:31157/rl/ws/
ProxyPassReverse /runloop/rl/ws/ ws://<k8s-master>:31157/rl/ws/
ProxyPass        /runloop/rl/    http://<k8s-master>:31157/rl/
ProxyPassReverse /runloop/rl/    http://<k8s-master>:31157/rl/
ProxyPass        /runloop        http://<k8s-master>:31383/runloop
ProxyPassReverse /runloop        http://<k8s-master>:31383/runloop
```

If tests from master work but external still 503, check Apache error log —
most likely cause is firewall blocking <k8s-master>:3138x from the external host.

### ❌ WebSocket connections close 1006 (Apache strips Upgrade)
Symptom: `wss://<your-domain>/runloop/rl/ws/...` connects and
immediately closes with code 1006; HTTP `/runloop/rl/health` returns 200
just fine. This means the vhost is reverse-proxying HTTP correctly but
not handling the WebSocket Upgrade handshake.

Two ways to fix; pick whichever matches the rest of the vhost. **Add
without removing existing rules** — the WS rule must be evaluated *before*
the regular HTTP rule because the first match wins:

**(a) mod_proxy / `ProxyPass` style** — what's already shown above. Make
sure the `ws://` line for `/runloop/rl/ws/` appears **above** the
`http://` one for `/runloop/rl/` so Apache picks it for upgrade requests.
Required Apache modules: `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`.

**(b) mod_rewrite style** — drop into the same `<VirtualHost>` (or
`<Location /runloop>`):

```apache
RewriteEngine On
# WebSocket upgrade — must come BEFORE any /runloop/rl rule that targets http://
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/runloop/rl/(.*) ws://<k8s-master>:31157/rl/$1 [P,L]
```

After editing the vhost, reload Apache (graceful — does not interrupt
existing connections):

```bash
sudo apachectl -t            # syntax check
sudo apachectl graceful      # reload without dropping
```

Verify from a host that can reach the public domain:

```bash
# Should print "HTTP/1.1 101 Switching Protocols"
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     https://<your-domain>/runloop/rl/ws/executions/ping | head -5
```

Once the 101 handshake works, the in-app live execution stream and the
Channels Tap subscriber (and any browser WS subscriber) will all flow.

---

## 8. File map

```
k8s/
  00-namespace.yaml       # namespace
  10-secret.yaml          # template only — real values via `kubectl create secret`
  20-postgres.yaml        # PG 16 + 10Gi PVC
  30-engine.yaml          # Go engine deployment + service
  40-web.yaml             # Next.js deployment (2 replicas) + service + init migrate
  # (no ingress shipped — bring your own; see WebSocket notes above)

scripts/deploy-prod.sh           # manual deploy from laptop
.github/workflows/release.yml    # tag → build cross-platform binaries + GitHub release
```

---

*Edit this doc via PR — deployment drift is painful to debug later.*
