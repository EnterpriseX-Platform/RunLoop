# COMMERCIAL Jenkins folder — setup runbook

This is the step-by-step to bring up a second deploy target ("COMMERCIAL")
that mirrors COMMUNITY using the same Jenkinsfiles. Source-of-truth is
single (`Jenkinsfile`, `.jenkins/Jenkinsfile.deploy`); each folder's
Jenkins jobs pass different parameters.

## What you need before clicking

| Item | Value (fill in for COMMERCIAL) |
|---|---|
| Namespace on KT1 | `commercial` |
| Domain | `commercial.oneweb.tech` |
| Ingress front-door IP | _ip-of-cluster-ingress_ |
| Kubeconfig with rights in `commercial` ns | upload as Jenkins "Secret file" credential |
| Docker Hub creds | reuse existing `docker-credential` |
| GitLab creds | reuse existing `gitlab-runloop` |

## 1. Bootstrap the namespace once

```bash
# from a workstation with the COMMERCIAL kubeconfig active
export KUBECONFIG=~/Downloads/kube-kt1-commercial.yaml

kubectl create namespace commercial 2>/dev/null || true

# pull secret — same image registry as COMMUNITY
kubectl -n commercial create secret docker-registry avalant-docker \
  --docker-server=docker.io \
  --docker-username='avalantdocker' \
  --docker-password='<docker-hub-pat>' \
  --docker-email='ops@avalantglobal.com'

# postgres + PV manifests — adapt the ones from k8s/10-postgres.yaml,
# changing nfs path to /datastore2/runloop-commercial/postgres
kubectl -n commercial apply -f k8s/00-namespace.yaml
kubectl -n commercial apply -f k8s/10-postgres.yaml
kubectl -n commercial apply -f k8s/20-secrets.yaml   # JWT_SECRET, SECRET_ENCRYPTION_KEY
kubectl -n commercial apply -f k8s/30-engine.yaml
kubectl -n commercial apply -f k8s/40-web.yaml
kubectl -n commercial apply -f k8s/50-ingress.yaml
```

> ⚠️ **`SECRET_ENCRYPTION_KEY`** must match between Next.js and Go engine
> in this namespace. Generate fresh per env (`openssl rand -hex 32`) and
> put it in `k8s/20-secrets.yaml` for both deployments. Do NOT reuse the
> COMMUNITY key — secrets shouldn't cross environments.

## 2. Apache front-door

Add a path entry to the in-cluster Apache so `commercial.oneweb.tech/runloop`
routes to the new services. Either:

- (preferred) one Apache deployment per namespace — the existing
  `community-http-config` ConfigMap pattern, copied into a new
  `commercial-http-config`.
- (shared) extend the central proxy to recognise host=commercial.* and
  rewrite to the `commercial` ns services.

Either way, the smoke test in `Jenkinsfile.deploy` curls
`http://${DOMAIN}/runloop` and `/runloop/rl/health`, both of which must
return 200 once routing is in place.

## 3. Jenkins folder + credentials

In the Jenkins UI:

1. **New Item** → enter `COMMERCIAL` → **Folder** → OK.
2. Inside `COMMERCIAL` → **Credentials** → **Add Credentials**:
   - Kind: **Secret file**
   - File: upload the COMMERCIAL kubeconfig
   - ID: `kubeconfig-commercial`   ← remember this
3. (Optional) restrict the folder to a Jenkins agent if you don't want
   COMMERCIAL deploys hitting the same node as COMMUNITY.

## 4. Jenkins jobs

### `/COMMERCIAL/runloop` (build)

- **New Item** → name `runloop` → **Pipeline**.
- Pipeline → Pipeline script from SCM → Git
  - Repository: `http://<git-server>/platform/runloop.git`
  - Credential: `gitlab-runloop`
  - Branch: `*/master`
  - Script Path: `Jenkinsfile`
- **This project is parameterized** → already declared inside the
  Jenkinsfile (`DEPLOY_TARGETS`). Set its **default value** here to
  `/COMMERCIAL/deploy-runloop-to-kube`. (Build pipelines should fan
  out only to their own folder unless you explicitly want both.)

### `/COMMERCIAL/deploy-runloop-to-kube`

- **New Item** → name `deploy-runloop-to-kube` → **Pipeline**.
- Pipeline → Pipeline script from SCM → Git
  - Repository: `http://<git-server>/platform/runloop.git`
  - Credential: `gitlab-runloop`
  - Branch: `*/master`
  - Script Path: `.jenkins/Jenkinsfile.deploy`
- **This project is parameterized** — override defaults:

  | Parameter | Value |
  |---|---|
  | `IMAGE_TAG` | `latest` |
  | `NAMESPACE` | `commercial` |
  | `DOMAIN` | `commercial.oneweb.tech` |
  | `INGRESS_RESOLVE_IP` | _ip-of-cluster-ingress_ |
  | `KUBECONFIG_CRED_ID` | `kubeconfig-commercial` |
  | `APPLY_MANIFESTS` | unchecked |

  > Jenkins will read the `parameters{}` block from the Jenkinsfile and
  > also let you override defaults in the job UI. The values you set in
  > the job UI become the new defaults for that job, so every build
  > targets `commercial` by default; an operator only chooses
  > `IMAGE_TAG` at run-time.

## 5. First deploy

1. Trigger `/COMMERCIAL/runloop` manually (no params needed).
2. It builds + pushes `avalantglobal/runloop-{web,engine}:v1.<date>-<sha>`.
3. On success it triggers `/COMMERCIAL/deploy-runloop-to-kube` with
   `IMAGE_TAG` set to the build tag.
4. Deploy job rolls both deployments, watches rollout status, smoke-tests
   the ingress.
5. On failure, post-stage rolls back via `kubectl rollout undo`.

## 6. Going forward

- One source of truth: changes to `Jenkinsfile` or
  `.jenkins/Jenkinsfile.deploy` apply to every folder simultaneously
  next time it builds.
- To deploy to **both** community + commercial from one build, set
  `DEPLOY_TARGETS=/COMMUNITY/deploy-runloop-to-kube,/COMMERCIAL/deploy-runloop-to-kube`
  on the build job (manual run only — change defaults if you want
  permanent fan-out).
- To pause auto-deploy temporarily, set `DEPLOY_TARGETS=` (empty) on the
  build job; you can still run the deploy job manually.

## Open items

- **TLS** — current setup terminates TLS at the edge before Apache.
  Confirm the COMMERCIAL domain has a cert provisioned at the same
  edge before going live.
- **DB isolation** — postgres in `commercial` ns is fully isolated from
  `community`. No data flows between them.
- **Secret rotation** — `SECRET_ENCRYPTION_KEY` rotation needs to
  re-encrypt every row in the `secrets` table. There's a
  `rotateEncryption()` helper in `apps/runloop/src/lib/encryption.ts`
  but no operator UI yet — to rotate: dump → re-encrypt → restore.
