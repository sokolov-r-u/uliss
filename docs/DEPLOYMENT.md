# Deployment

How to run the full stack (not just host-based `bootRun` — see the root `CLAUDE.md` for that).
Cross-cutting rules — `../CLAUDE.md`, read that first.

## Running the full stack locally (Docker Compose, no minikube)

An alternative to minikube for everyday local dev — no cluster, no `kubectl`/`skaffold`. Runs the
same images the k8s path builds, orchestrated by plain Docker Compose instead. **The minikube/skaffold
path below is unchanged and still fully supported** — this is an additional option, not a replacement.

- Add `127.0.0.1 uliss.local` to your real `/etc/hosts` (see `infra/etc.hosts` for the full list,
  including `auth.uliss.local` etc., already needed for host-based `bootRun` dev).
- Build the images once (same commands as the k8s manual fallback below):
  `./gradlew :auth:jibDockerBuild :user:jibDockerBuild :note:jibDockerBuild` and
  `docker build -t uliss/web:latest -f module/web/Dockerfile .`.
- `docker compose -f infra/docker-compose.yml --profile full up -d` — brings up `postgres` plus
  `auth`/`user`/`note`/`web`. Plain `docker compose -f infra/docker-compose.yml up -d` (no
  `--profile full`) keeps starting only `postgres`, for the host-based `bootRun` flow above.
- `auth`/`user`/`note` read `infra/.env` via `env_file`, with two container-only overrides on top:
  `USER_SERVICE_HOST=user` on `auth` (its gRPC client target — `localhost` only makes sense for
  host-based `bootRun`) and `FRONTEND_URL=http://uliss.local` on `user`/`note` (the OAuth
  `redirect-uri` `:security` builds — the compose `web` container serves on `:80`, not the Vite dev
  port `:3000`). `auth` also gets a Compose network alias `auth.uliss.local`, so
  `AUTH_PUBLIC_URL`/`AUTH_INTERNAL_URL` need no override — the same hostname resolves from both the
  host browser and sibling containers.
- Same-origin SPA routing (`/user`, `/note`) has no Ingress to do it here, so `module/web/nginx.conf`
  proxies those paths itself (see "web" below) — inert under k8s.
- Rebuild + `docker compose -f infra/docker-compose.yml --profile full up -d` again to pick up new
  images (`:latest` + Compose recreates a service when its image content changes).

## Deploying to Kubernetes (minikube)

Manifests and kustomize live under `infra/`, deployed with one command: `kubectl apply -k infra`.

- **A single kustomization** (`infra/kustomization.yaml`): `secretGenerator` from `infra/.env` (shared
  with Docker/IntelliJ, `disableNameSuffixHash: true` → the name `uliss-secret` is stable) + `patches:`
  onto `k8s/patch-k8s-secret.yaml`. The patch, via `stringData`, **overrides** only the "address" keys
  for k8s (`POSTGRES_URL`, `AUTH_PUBLIC_URL`, `AUTH_INTERNAL_URL`, `FRONTEND_URL`) — `stringData`
  wins over `data` on apply. This way local and k8s don't collide without a second env file/overlay
  (an overlay inside `infra/` isn't possible — kustomize flags a cycle; hence the patch instead).
- **Ingress** (`k8s/ingress.yaml`) — by host, `auth.uliss.local` → `auth:9000`, `user.uliss.local` →
  `user:8080`, `note.uliss.local` → `note:8081`, and on `uliss.local` **path-routing** (same-origin for
  the SPA): `/user` → `user:8080`, `/note` → `note:8081`, `/` → `web:80`. Each service serves its whole
  path under its own name (see "Path-prefix convention" in the root `CLAUDE.md`) — one rule per service
  instead of one per resource.
- **`web`** — image built from `module/web/Dockerfile` (multi-stage: node build → `nginx:alpine`), where
  `module/web/nginx.conf` provides SPA fallback (`try_files $uri /index.html`) + `no-store` on `index.html`,
  immutable on `/assets/`. Without it, client-side routes (`/callback`) would return 404. It also proxies
  `/user/` and `/note/` to those services — needed for same-origin routing under plain `docker compose`
  (no ingress there); inert under k8s, where Ingress routes those paths before they reach this pod.
- **Images:** `auth`/`user`/`note` — Jib (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild
  :note:jibDockerBuild`, config — `io.uliss.docker-conventions`, `uliss/<project>:latest`); `web` —
  `docker build -t uliss/web:latest -f module/web/Dockerfile .`.
- **CI image publish (`.github/workflows/docker-publish.yml`):** on every push to `main`, builds +
  tests, then pushes all four images to GHCR (`ghcr.io/<owner>/<auth|user|note|web>:latest`) — Jib via
  `:auth:jib :user:jib :note:jib -Pdocker.registry=ghcr.io/<owner>` (the `docker.registry` Gradle
  property in `io.uliss.docker-conventions` overrides `to.image`'s registry; unset locally, so plain
  `jibDockerBuild` is unaffected), `web` via `docker/build-push-action`. Auth is the built-in
  `GITHUB_TOKEN` (no extra secrets). **One-time manual step after the first run:** each of the 4 GHCR
  packages is created private by default even on a public repo — flip each to Public, or a Droplet's
  `docker compose pull` has no credentials to fetch them.
- **Base JRE image (`docker.jre.version` in `gradle.properties`):** not the stock `eclipse-temurin`
  tag — `ghcr.io/<owner>/base-jre:<tag>`, our own image (`infra/docker/base-jre/Dockerfile`,
  published by `.github/workflows/base-jre-publish.yml` as a multi-arch `linux/amd64,linux/arm64`
  manifest, since the same tag is pulled both locally on Apple Silicon and by CI on amd64). It's
  `eclipse-temurin:25.0.3_9-jre` (Ubuntu/glibc) plus `curl`, kept installed — Adoptium's own
  Dockerfile installs `wget`/`gnupg` only to download the JDK, then purges both before publishing,
  so the stock tag has no HTTP client for `infra/docker-compose.yml`'s `auth`/`user`/`note`
  healthchecks (`curl -f http://localhost:<port>/actuator/health`) to use. The `-alpine` tag would
  have `wget` built in via BusyBox for free, but was rejected: musl libc's DNS resolver has a
  history of issues in `ndots`/search-domain-heavy `resolv.conf` setups like k8s's, and glibc was
  preferred deliberately.
- **Workflow under minikube — `skaffold run`** (`skaffold.yaml` at repo root). One command: builds
  all three images **straight into minikube's docker daemon** (Skaffold auto-detects the context —
  `eval $(minikube docker-env)` isn't needed), deploys via kustomize (`infra/`), and rolls out
  automatically. The rollout triggers by itself because Skaffold tags images with a unique digest and
  swaps `uliss/<svc>:latest` in the manifests for `uliss/<svc>:<digest>` — changing the reference means
  a new pod (works around the `:latest`+`IfNotPresent` problem).
  Builders: `auth`/`user` — Jib (artifacts `jib.project: auth|user`), `web` — Docker (`module/web/Dockerfile`).
  `skaffold delete` — tear it down. When editing shared libs (`:security` etc.), Jib rebuilds the dependent
  services on its own.
- **Manual (fallback / what Skaffold does under the hood):** `eval $(minikube docker-env)` (in the
  **same** shell — otherwise the build goes to the local docker and the cluster can't see it) → rebuild
  images (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild :note:jibDockerBuild`; `docker build -t
  uliss/web:latest -f module/web/Dockerfile .`) → `kubectl apply -k infra` →
  **`kubectl rollout restart deploy/<auth|user|note|web>`**
  (env from `envFrom.secretRef` and the `:latest`+`IfNotPresent` image are only picked up when the pod
  is recreated).
