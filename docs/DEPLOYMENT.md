# Deployment

How to run the full stack beyond host-based `bootRun`. Cross-cutting agent rules are in
`../CLAUDE.md`; read those first. The repository rules require explicit permission before starting
applications or infrastructure.

## Running the full stack locally (Docker Compose, no minikube)

An alternative to minikube for everyday local dev — no cluster, no `kubectl`/`skaffold`. Runs the
same images the k8s path builds, orchestrated by plain Docker Compose instead. **The minikube/skaffold
path below is unchanged and still fully supported** — this is an additional option, not a replacement.

- Add `127.0.0.1 uliss.home` to your real `/etc/hosts` (see `infra/etc.hosts` for the full list,
  including `auth.uliss.home` etc., already needed for host-based `bootRun` dev).
- Build all four images in one command: `./gradlew buildAllImages` — aggregates
  `:auth:jibDockerBuild`/`:user:jibDockerBuild`/`:note:jibDockerBuild` (Jib, local Docker daemon
  only) plus `buildWebImage` (a plain `docker build -t uliss/web:latest -f module/web/Dockerfile .`,
  since `web` isn't a Gradle subproject). Each image gets both a `:latest` tag and a version tag
  (`uliss/<service>:<version>`, matching each module's own version — `web`'s comes from
  `module/web/package.json`). Rebuilding without a version bump retags `:latest`/`:<version>`
  onto the new image, leaving the previous one dangling (`<none>:<none>`) — clean those up with
  `docker image prune -f`; a genuinely old version tag (after a deliberate version bump) has to
  be removed by hand (`docker rmi uliss/<service>:<old-version>`).
- Issue the TLS certificate once (`web` does not start without it): see "HTTPS for the home deployment" below.
- `docker compose -f infra/docker-compose.yml --profile full up -d` — brings up `postgres` plus
  `auth`/`user`/`note`/`web`. Plain `docker compose -f infra/docker-compose.yml up -d` (no
  `--profile full`) keeps starting only `postgres`, for the host-based `bootRun` flow above.
- `auth`/`user`/`note` read `infra/.env` via `env_file`, with container-only overrides on top:
  `USER_SERVICE_HOST=user` on `auth` (its gRPC client target — `localhost` only makes sense for
  host-based `bootRun`) and `FRONTEND_URL=https://uliss.home` on `auth`/`user`/`note` (the OAuth
  `redirect-uri` `:security` builds, and where `auth` sends a login without a saved authorize request — the compose
  `web` container serves HTTPS, not the Vite dev port `:3000`). `auth` also gets
  `AUTH_CLIENT_CALLBACK_URLS=https://uliss.home/callback`; all three get `AUTH_SECURE_COOKIE=true`,
  `AUTH_PUBLIC_URL=https://auth.uliss.home` (browser-facing, through the `web` nginx) and
  `AUTH_INTERNAL_URL=http://auth:9000` (service-to-service inside the Compose network, so containers need not trust
  the local CA); see "HTTPS for the home deployment" below. `auth` publishes `:9000` on `127.0.0.1` only, for
  debugging.
- Same-origin SPA routing (`/user`, `/note`) has no Ingress to do it here, so `module/web/nginx/uliss-app.conf`
  proxies those paths itself (see "web" below) — inert under k8s. Compose sets
  `NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates-tls` on `web`, which picks the TLS variant of the nginx config.
- `auth`/`user`/`note` log Logstash-format JSON (compose only; `bootRun` keeps plain text), to stdout
  and to `infra/volumes/logs/<service>.log` (gitignored). Files roll daily or at 10 MB into `archive/` as plain text,
  kept 7 days (1 GB cap).
- `postgres` (`5432`) and the `user` gRPC port (`9090`) are published on `127.0.0.1` only: host-based `bootRun`
  still reaches them, other machines do not. Containers talk over the Compose network (`user:9090`).
- `dozzle` (no profile, starts with any `up`) is a live log viewer for all containers at
  `http://localhost:8888`.
- Rebuild + `docker compose -f infra/docker-compose.yml --profile full up -d` again to pick up new
  images (`:latest` + Compose recreates a service when its image content changes).

## HTTPS for the home deployment

Browsers expose the microphone (dictation) only to secure contexts, so the compose `web` nginx serves
`https://uliss.home` and `https://auth.uliss.home` with a certificate from a local CA
([mkcert](https://github.com/FiloSottile/mkcert)). `:80` answers with a 302 to the HTTPS address of the same app
(`GET /healthz` excepted, for the compose healthcheck); `:443` redirects any other Host (`localhost`, an IP) to
`https://uliss.home`. `auth.uliss.home` is proxied to `auth:9000` with `X-Forwarded-Proto/Host/Port` set by nginx
(client values overwritten, `Forwarded` cleared); `auth` builds its redirects from them
(`server.forward-headers-strategy: framework`) and marks its session cookie Secure from `AUTH_SECURE_COOKIE`. No HSTS:
with a self-signed CA it would block falling back to HTTP. Host-based `bootRun` + Vite `:3000` stays on HTTP
(`http://auth.uliss.home:9000`; dictation there needs the Chrome flag `unsafely-treat-insecure-origin-as-secure`).
Switching the issuer invalidates access tokens issued under the old `http://…:9000` one; the SPA refreshes them, or
the user signs in again.

### Certificate

- One-time on the Mac: `brew install mkcert`, then `mkcert -install` (asks for the Mac password; adds the CA to the
  system keychain, which Chrome and Safari use). The CA key stays in `$(mkcert -CAROOT)`
  (`~/Library/Application Support/mkcert`), outside the repository — never share `rootCA-key.pem`.
- `infra/tls/generate-certs.sh` writes `infra/volumes/tls/uliss.home.pem` and `uliss.home-key.pem` (gitignored; SAN
  `uliss.home`, `auth.uliss.home`, `localhost`, `127.0.0.1`; about 825 days, the most iOS accepts). Compose mounts that folder read-only
  into `web`; the image contains no certificate.
- Renewal: run the script again and recreate `web`
  (`docker compose -f infra/docker-compose.yml --profile full up -d --force-recreate web`). Devices keep trusting the
  same CA and need nothing.

### Trusting the CA on other devices

Send `$(mkcert -CAROOT)/rootCA.pem` (the public CA certificate, not the key) to the device: AirDrop for an iPhone or
iPad, a messenger, email or cloud drive for Android. Turn off the browser's secure DNS (DoH) on the device, or
`uliss.home` will not resolve over the VPN.

- **iPhone / iPad:** open the file → Settings → "Profile Downloaded" → Install. Then — mandatory, otherwise Safari
  still rejects the certificate — Settings → General → About → Certificate Trust Settings → enable full trust for
  "mkcert …".
- **Android:** Settings → Security (and privacy) → More security settings → Encryption & credentials → Install a
  certificate → CA certificate → Install anyway → pick the file (menu names vary by vendor; search Settings for
  "CA certificate"; if the file is not offered, rename it to `rootCA.crt`). Chrome trusts user-installed CAs; Firefox
  for Android does not by default.
- **Firefox on the Mac** (optional): `brew install nss`, then `mkcert -install` again.

Check: `https://uliss.home` and the login page on `https://auth.uliss.home` open with a padlock and no warning, and
the microphone in a chat is enabled.

### VPN access (Amnezia VPS)

The VPS reaches the Mac through the reverse SSH tunnel (launchd agent `io.uliss.tunnel`, `-R 172.29.172.1:<port>`),
so HTTPS needs port 443 in the tunnel and in ufw. Keep `:80` for the redirect; `:9000` is no longer needed, since
`auth` is reached through `:443`.

1. Tunnel, on the Mac:

   ```bash
   cp ~/Library/LaunchAgents/io.uliss.tunnel.plist ~/Library/LaunchAgents/io.uliss.tunnel.plist.bak
   /usr/libexec/PlistBuddy -c "Add :ProgramArguments:10 string -R" \
       -c "Add :ProgramArguments:11 string 172.29.172.1:443:localhost:443" \
       ~/Library/LaunchAgents/io.uliss.tunnel.plist
   plutil -p ~/Library/LaunchAgents/io.uliss.tunnel.plist   # the last argument must still be uliss-vps
   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/io.uliss.tunnel.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.uliss.tunnel.plist
   ```

   Then drop the `:9000` forward (indices 8 and 9 — `-R` and `172.29.172.1:9000:localhost:9000` — whether or not
   443 was added already):

   ```bash
   cp ~/Library/LaunchAgents/io.uliss.tunnel.plist ~/Library/LaunchAgents/io.uliss.tunnel.plist.bak9000
   /usr/libexec/PlistBuddy -c "Print :ProgramArguments:9" ~/Library/LaunchAgents/io.uliss.tunnel.plist   # must be the 9000 forward
   /usr/libexec/PlistBuddy -c "Delete :ProgramArguments:9" -c "Delete :ProgramArguments:8" \
       ~/Library/LaunchAgents/io.uliss.tunnel.plist
   plutil -p ~/Library/LaunchAgents/io.uliss.tunnel.plist   # -R 80, -R 443, uliss-vps
   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/io.uliss.tunnel.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.uliss.tunnel.plist
   ```

   Rollback: move the matching `.bak`/`.bak9000` back over the plist and repeat `bootout`/`bootstrap`.
2. Firewall, on the VPS — allow 443, then close 9000:

   ```bash
   ufw allow in on amn0 from 172.29.172.0/24 to any port 443 proto tcp
   ufw status numbered
   ```

   If 9000 shares a rule with 80 (`80,9000/tcp`), first add
   `ufw allow in on amn0 from 172.29.172.0/24 to any port 80 proto tcp`; then remove the 9000 rule by its number
   (`ufw delete <n>`, run `ufw status numbered` again before each delete, numbers shift).
   Rollback: `ufw delete allow in on amn0 from 172.29.172.0/24 to any port 443 proto tcp` and re-add the 9000 rule
   (`ufw allow in on amn0 from 172.29.172.0/24 to any port 80,9000 proto tcp`, or its original form from
   `/root/uliss-backup/`).
3. DNS for every VPN client, on the VPS. The DNAT that sends DNS to CoreDNS (`uliss-dns`, `172.29.172.53`) matches
   only the phone (`10.8.1.4`); another device (iPad, Android) is a separate VPN client and does not resolve
   `uliss.home`. Inspect first with `docker exec amnezia-awg2 iptables -t nat -S PREROUTING`, then widen it to the
   whole client subnet:

   ```bash
   for proto in udp tcp; do
     docker exec amnezia-awg2 iptables -t nat -I PREROUTING -s 10.8.1.0/24 -p $proto --dport 53 \
         -j DNAT --to-destination 172.29.172.53
   done
   ```

   Rollback: the same commands with `-D` instead of `-I`. Like the existing rule, it is lost when the container or
   the server restarts.

## Note-service AI credentials and background work

Chat replies, final summaries, and retrieval/indexing embeddings all use `OPENAI_API_KEY`; copy the
full key set from `infra/env.example.properties` into `infra/.env`. `OPENAI_CHAT_MODEL` and
`OPENAI_EMBEDDING_MODEL` are optional overrides. `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` are needed
only if chat is switched back to DeepSeek. Compose supplies this file through `env_file`, and
Kubernetes supplies the same values from the generated `uliss-secret` through `envFrom`.

The note-service context and health endpoint can start without valid provider credentials, but
provider-backed calls will fail; queued summary/index work consumes the configured retries.
Summary/index work is stored in PostgreSQL before processing, so restarting or rolling out
note-service does not discard queued events. Multiple replicas can claim work concurrently through
`FOR UPDATE SKIP LOCKED`; keep all replicas on compatible code and database migrations because the
outbox payloads are consumed by any instance.

## Deploying to Kubernetes (minikube)

Manifests and kustomize live under `infra/`, deployed with one command: `kubectl apply -k infra`.

- **A single kustomization** (`infra/kustomization.yaml`): `secretGenerator` from `infra/.env` (shared
  with Docker/IntelliJ, `disableNameSuffixHash: true` → the name `uliss-secret` is stable) + `patches:`
  onto `k8s/patch-k8s-secret.yaml`. The patch, via `stringData`, **overrides** only the "address" keys
  for k8s (`POSTGRES_URL`, `AUTH_PUBLIC_URL`, `AUTH_INTERNAL_URL`, `FRONTEND_URL`) — `stringData`
  wins over `data` on apply. This way local and k8s don't collide without a second env file/overlay
  (an overlay inside `infra/` isn't possible — kustomize flags a cycle; hence the patch instead).
- **Ingress** (`k8s/ingress.yaml`) — by host, `auth.uliss.home` → `auth:9000`, `user.uliss.home` →
  `user:8080`, `note.uliss.home` → `note:8081`, and on `uliss.home` **path-routing** (same-origin for
  the SPA): `/user` → `user:8080`, `/note` → `note:8081`, `/` → `web:80`. Each service serves its whole
  path under its own name (see the path-prefix convention in the root `CLAUDE.md`) — one rule per service
  instead of one per resource.
- **`web`** — image built from `module/web/Dockerfile` (multi-stage: node build → `nginx:alpine`). By default it
  serves plain HTTP on `:80` from `module/web/nginx/http/default.conf.template` — TLS belongs to the Ingress here;
  the compose TLS variant (`module/web/nginx/tls/`) is selected only by `NGINX_ENVSUBST_TEMPLATE_DIR`. Both variants
  include `module/web/nginx/uliss-app.conf`; the template, rendered by the nginx image with `WEB_CANONICAL_HOST`
  (default `uliss.home`), answers any other Host (an IP, `localhost`) with a 302 to that host, so the login starts where the OAuth callback
  returns. It provides SPA fallback (`try_files $uri /index.html`) + `no-store` on `index.html`,
  immutable on `/assets/`. Without it, client-side routes (`/callback`) would return 404. It also proxies
  `/user/` and `/note/` to those services — needed for same-origin routing under plain `docker compose`
  (no ingress there); inert under k8s, where Ingress routes those paths before they reach this pod.
- **Images:** `auth`/`user`/`note` — Jib (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild
  :note:jibDockerBuild`, config — `io.uliss.docker-conventions`, `uliss/<project>:latest`); `web` —
  `docker build -t uliss/web:latest -f module/web/Dockerfile .`.
- **PR gate (`.github/workflows/pr-checks.yml`):** runs on every PR open/update against `main` —
  backend job (`./gradlew build`, `integrationTest`, `jacocoRootReport` as an artifact) and a
  parallel frontend job (`npm run build -w @uliss/web`). Publishes nothing; only gates the merge
  once branch protection requires `backend-checks`/`frontend-checks`.
- **CI image publish (`.github/workflows/docker-publish.yml`):** on push to `main` only, four jobs —
  `changes` (path-filter via `dorny/paths-filter`) → `base-jre` (only if
  `infra/docker/base-jre/**` changed, or manual dispatch) → `jvm-images` (`auth`/`user`/`note`,
  always runs regardless of path filtering; waits on `base-jre` via `needs` so it never pulls a base
  image before it's pushed) → `web-image` (only if `module/web/**`/`uliss-design-system/**` changed;
  independent, runs in parallel with the others). Jib via `:auth:jib :user:jib :note:jib
  -Pdocker.registry=ghcr.io/<owner>` (the `docker.registry` Gradle property in
  `io.uliss.docker-conventions` overrides `to.image`'s registry; unset locally, so plain
  `jibDockerBuild` is unaffected). Auth for every job is the built-in `GITHUB_TOKEN` (no extra
  secrets) via the shared `.github/actions/ghcr-login` composite action. **One-time manual step
  after the first run:** each GHCR package is created private by default even on a public repo —
  flip each to Public, or a Droplet's `docker compose pull` has no credentials to fetch them.
- **Base JRE image (`docker.jre.version` in `gradle.properties`):** not the stock `eclipse-temurin`
  tag — `ghcr.io/<owner>/base-jre:<tag>`, our own image (`infra/docker/base-jre/Dockerfile`,
  published by `.github/workflows/docker-publish.yml`'s `base-jre` job (only when
  `infra/docker/base-jre/**` changes) as a multi-arch `linux/amd64,linux/arm64`
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
