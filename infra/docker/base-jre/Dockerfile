# Adoptium's own eclipse-temurin Dockerfile installs curl-equivalent tools (wget/gnupg) only to
# download the JDK, then purges them before publishing. This layer keeps curl around so Docker
# Compose healthchecks (infra/docker-compose.yml) have an HTTP client to hit /actuator/health with.
FROM eclipse-temurin:25.0.4.1_1-jre
# ubuntu:26.04 ships Canonical's Pebble outside dpkg, so apt never patches its Go runtime; Jib sets the entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* /usr/bin/pebble /var/lib/pebble
