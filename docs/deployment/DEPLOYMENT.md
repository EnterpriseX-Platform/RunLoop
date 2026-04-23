# RunLoop — Production Deployment Guide

> **Target cluster:** same K8s as ORCH (`10.1.102.89` master)
> **Namespace:** `community`
> **Domain:** `https://community.oneweb.tech/runloop`
> **Jenkins:** `http://10.1.102.52:32552/job/COMMUNITY/`

---

## 1. Topology

```
Browser
  │
  ▼  https://community.oneweb.tech/runloop/*
┌────────────────── Ingress (nginx) ──────────────────┐
│  /runloop/rl/ws/* ─┐                                 │
│  /runloop/rl/*   ──┼──▶  runloop-engine  (Go :8092)  │
│  /runloop/*      ───▶    runloop-web     (Next :3081)│
└──────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
     runloop-engine  ◀─── SQL ───▶  runloop-postgres (PG 16)
           ▲
           └── server-side rewrite ──── runloop-web
               ENGINE_URL=http://runloop-engine:8092
```

**Why the split routes:**
- Next.js `basePath: /runloop` serves the UI + proxies `/api/*` server-side to the engine.
- WebSockets (live execution logs) need to reach the engine **directly** from the browser — Next.js doesn't proxy WS. So the Ingress carves out `/runloop/rl/*` to hit the engine pod.

---

## 2. One-time bootstrap (first deploy only)

On the master node:

```bash
ssh onewebadm@10.1.102.89

# 2.1 Create namespace
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: community
EOF

# 2.2 Create secret (do NOT commit real values)
kubectl -n community create secret generic runloop-secret \
  --from-literal=DATABASE_URL='postgresql://runloop:<PASSWORD>@runloop-postgres:5432/runloop?schema=public' \
  --from-literal=POSTGRES_PASSWORD='<PASSWORD>' \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=SECRETS_KEY="$(openssl rand -hex 16)"   # 32 chars exactly

# 2.3 TLS cert — assumes community-oneweb-tls already exists in community ns
#     If not: copy from another namespace or request from ops
kubectl -n community get secret community-oneweb-tls || {
  echo "TLS secret missing — ask ops"
}

# 2.4 Apply manifests (run from a checkout of this repo on your laptop)
cat k8s/20-postgres.yaml | ssh onewebadm@10.1.102.89 'kubectl apply -f -'
cat k8s/30-engine.yaml   | ssh onewebadm@10.1.102.89 'kubectl apply -f -'
cat k8s/40-web.yaml      | ssh onewebadm@10.1.102.89 'kubectl apply -f -'
cat k8s/50-ingress.yaml  | ssh onewebadm@10.1.102.89 'kubectl apply -f -'
```

---

## 3. Deploy options

| Option | When | Time |
|---|---|:-:|
| **A. Manual** (`./scripts/deploy-prod.sh`) | hotfix, first deploy, debugging | ~8 min |
| **B. Jenkins CI** | normal team workflow (push to master) | ~6 min |

### A. Manual deploy

```bash
# Auto tag (date + git short SHA)
./scripts/deploy-prod.sh

# Custom tag
./scripts/deploy-prod.sh my-feature-v1

# Build only (no push/deploy)
BUILD_ONLY=1 ./scripts/deploy-prod.sh

# Deploy existing tag (skip build + push)
SKIP_BUILD=1 ./scripts/deploy-prod.sh v1.20260423-abc1234
```

Builds + pushes **both** images then does `kubectl set image` for each
deployment via SSH to the master node.

### B. Jenkins CI

```
git push origin master
  ↓ (webhook)
http://10.1.102.52:32552/job/COMMUNITY/job/runloop/
  ↓  builds runloop-web + runloop-engine, pushes to Docker Hub
http://10.1.102.52:32552/job/COMMUNITY/job/deploy-runloop-to-kube/
  ↓  kubectl set image + rollout status
live at https://community.oneweb.tech/runloop ✅
```

#### Jenkins folder setup (first time)

1. Open `http://10.1.102.52:32552`
2. **New Item → Folder** → name = `COMMUNITY` (parallel to existing `BB` folder)
3. Inside `COMMUNITY/`:
   - **New Item → Multibranch Pipeline** → `runloop`
     - Git repo: this project
     - Script path: `Jenkinsfile`
   - **New Item → Pipeline** → `deploy-runloop-to-kube`
     - Parameter: `IMAGE_TAG` (string, default `latest`)
     - Parameter: `APPLY_MANIFESTS` (boolean, default false)
     - Script path: `.jenkins/Jenkinsfile.deploy` (Pipeline from SCM)
4. **Credentials** (Jenkins → Manage → Credentials → COMMUNITY folder):
   - `dockerhub-avalantglobal` — Username/password
   - `kubeconfig-community` — Secret file (kubeconfig scoped to `community` ns)

---

## 4. Verification

```bash
# Pod status
ssh onewebadm@10.1.102.89 'kubectl get pod -n community -o wide'

# Expected:
# runloop-web-<hash>      2/2 Running
# runloop-engine-<hash>   1/1 Running
# runloop-postgres-<hash> 1/1 Running

# Tail logs
ssh onewebadm@10.1.102.89 'kubectl logs -n community -l app=runloop-web    --tail=50 -f'
ssh onewebadm@10.1.102.89 'kubectl logs -n community -l app=runloop-engine --tail=50 -f'

# Ingress health
curl -skI https://community.oneweb.tech/runloop | head -3
# Expect: HTTP/2 307 (redirect to /runloop/dashboard)

# Engine health
curl -sk https://community.oneweb.tech/runloop/rl/health
# Expect: {"status":"ok"}

# Image tag check
ssh onewebadm@10.1.102.89 \
  'kubectl get deployment -n community runloop-web -o jsonpath="{.spec.template.spec.containers[0].image}"'
# Expect: avalantglobal/runloop-web:<your-tag>
```

---

## 5. Rollback

```bash
# Fast path — undo last change
ssh onewebadm@10.1.102.89 \
  'kubectl rollout undo deployment/runloop-web -n community'
ssh onewebadm@10.1.102.89 \
  'kubectl rollout undo deployment/runloop-engine -n community'

# Pin to a specific known-good tag
ssh onewebadm@10.1.102.89 \
  'kubectl set image deployment/runloop-web -n community web=avalantglobal/runloop-web:v1.20260422-deadbee'
```

---

## 6. Common operations

```bash
# Restart (no image change — picks up ConfigMap edits)
ssh onewebadm@10.1.102.89 'kubectl rollout restart deployment/runloop-web -n community'

# Exec into web pod
ssh -t onewebadm@10.1.102.89 \
  'kubectl exec -it -n community deployment/runloop-web -- sh'

# Prisma Studio via port-forward
ssh -f -N -L 15481:localhost:15481 onewebadm@10.1.102.89
ssh onewebadm@10.1.102.89 \
  "nohup kubectl port-forward -n community --address 0.0.0.0 svc/runloop-postgres 15481:5432 > /tmp/runloop-pf.log 2>&1 &"
# Now: PGPASSWORD=<pwd> psql -h localhost -p 15481 -U runloop -d runloop

# Reset DB schema (dev only!)
ssh onewebadm@10.1.102.89 \
  'kubectl exec -n community deploy/runloop-web -- npx prisma db push --force-reset'
```

---

## 7. Troubleshooting

### ❌ `exec format error` in pod
Image built on ARM Mac without `--platform linux/amd64`. Rebuild with the flag — our `scripts/deploy-prod.sh` already sets it.

### ❌ WebSocket disconnects
Browser connects to `wss://community.oneweb.tech/runloop/rl/ws/executions/<id>`. If it fails:
1. Ingress path `/runloop/rl/ws` must come **before** `/runloop` in manifest (order matters).
2. `proxy-read-timeout` must be long (we set 3600s).
3. `useWebSocket.ts` in the app uses `window.location.host` — if hardcoded to a dev port, fix before deploy.

### ❌ Engine can't reach Postgres
Check `DATABASE_URL` in `runloop-secret`. Host must be `runloop-postgres` (the service DNS), not `localhost`.

### ❌ `prisma db push` hangs in init container
Postgres pod not ready yet — delete the web pod, it'll retry:
```bash
ssh onewebadm@10.1.102.89 'kubectl delete pod -n community -l app=runloop-web'
```

### ❌ Ingress returns 404 for /runloop/*
`ingressClassName: nginx` must match the installed ingress controller. Check:
```bash
kubectl get ingressclass
```

---

## 8. File map

```
k8s/
  00-namespace.yaml       # community ns
  10-secret.yaml          # template only — real values via `kubectl create secret`
  20-postgres.yaml        # PG 16 + 10Gi PVC
  30-engine.yaml          # Go engine deployment + service
  40-web.yaml             # Next.js deployment (2 replicas) + service + init migrate
  50-ingress.yaml         # /runloop + /runloop/rl + /runloop/rl/ws routes

Jenkinsfile                      # build + push (at /COMMUNITY/runloop)
.jenkins/Jenkinsfile.deploy      # deploy (at /COMMUNITY/deploy-runloop-to-kube)
scripts/deploy-prod.sh           # manual deploy from laptop
```

---

*Edit this doc via PR — deployment drift is painful to debug later.*
