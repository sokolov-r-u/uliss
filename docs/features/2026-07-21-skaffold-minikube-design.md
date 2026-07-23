# Skaffold for minikube — design

**Date:** 2026-07-21
**Goal:** Replace the manual build/deploy/rollout cycle with a single command (`skaffold run`).

## Problem

Current inner loop (from CLAUDE.md) is manual and error-prone:

```bash
eval $(minikube docker-env)
./gradlew :auth:jibDockerBuild :user:jibDockerBuild
docker build -t uliss/web:latest -f module/web/Dockerfile .
kubectl apply -k infra
kubectl rollout restart deploy/auth deploy/user deploy/web
```

Because images are `:latest` + `imagePullPolicy: IfNotPresent`, a fresh `apply` does not
restart pods — hence the manual `rollout restart`.

## Scope

- On-demand only: `skaffold run` (one-shot build + deploy + rollout, then exit). Also `skaffold delete`.
- No `dev` watch mode, no port-forward, no debug ports, no prod/dev profiles.

## Design

Single `skaffold.yaml` at the repo root (next to `gradlew`).

### Builders

Skaffold auto-detects the active minikube context and builds directly into minikube's docker
daemon, so `eval $(minikube docker-env)` is no longer needed.

| Image        | Builder | Source                                             |
|--------------|---------|----------------------------------------------------|
| `uliss/auth` | jib     | Gradle project `:auth` (`module/auth`)             |
| `uliss/user` | jib     | Gradle project `:user` (`module/user/user-app`)    |
| `uliss/web`  | docker  | `module/web/Dockerfile`, context `.` (repo root)   |

`build.local.push: false` — images stay in minikube, nothing is pushed to a registry.

### Deploy

kustomize deployer pointing at `infra/` (same as `kubectl apply -k infra`), so all secrets
(`secretGenerator` from `infra/.env`) and the k8s patch apply unchanged.

### Automatic rollout

Skaffold tags each built image uniquely (default: git commit) and rewrites the image
references in the rendered manifests (`uliss/auth:latest` → `uliss/auth:<tag>`). The changed
tag makes the Deployment roll out a new pod automatically — the manual `kubectl rollout
restart` disappears.

### skaffold.yaml (draft)

```yaml
apiVersion: skaffold/v4beta14
kind: Config
metadata:
  name: uliss
build:
  local:
    push: false
  artifacts:
    - image: uliss/auth
      context: .
      jib:
        project: ":auth"
    - image: uliss/user
      context: .
      jib:
        project: ":user"
    - image: uliss/web
      context: .
      docker:
        dockerfile: module/web/Dockerfile
manifests:
  kustomize:
    paths:
      - infra
deploy:
  kubectl: {}
```

## Known risk

The `io.uliss.docker-conventions` plugin hardcodes `jib.to.image` in `afterEvaluate`. Skaffold
passes its computed image name via the `-Djib.to.image` system property, which takes precedence
over Jib DSL config, so the substitution should win. Verify with a real run
(`skaffold build --dry-run` / `skaffold diagnose`). If Jib ignores the override, adjust the
skaffold artifact or make the plugin's `to.image` overridable.

## Usage

```bash
skaffold run      # build all + deploy + rollout, then exit
skaffold delete   # tear down
```

## Docs

Update the "Деплой в Kubernetes" section of CLAUDE.md to mention `skaffold run` as the primary
loop (keeping the manual commands as fallback / explanation).
