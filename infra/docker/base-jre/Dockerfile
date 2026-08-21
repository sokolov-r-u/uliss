# Adoptium's own eclipse-temurin Dockerfile installs curl-equivalent tools (wget/gnupg) only to
# download the JDK, then purges them before publishing. This layer keeps curl around so Docker
# Compose healthchecks (infra/docker-compose.yml) have an HTTP client to hit /actuator/health with.
FROM eclipse-temurin:25.0.3_9-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
