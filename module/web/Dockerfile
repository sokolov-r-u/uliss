# major version of the repo-root .nvmrc
# pinned by digest for reproducible builds; Dependabot (docker) proposes updates
FROM node:26-alpine3.24@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS build
WORKDIR /app

# manifests first: the npm ci layer is reused until a dependency changes, not on every source edit
COPY package.json package-lock.json ./
COPY module/web/package.json module/web/package.json
COPY module/lib/uliss-design-system/package.json module/lib/uliss-design-system/package.json
RUN npm ci

COPY module/web module/web
COPY module/lib/uliss-design-system module/lib/uliss-design-system
RUN npm run build -w @uliss/web

FROM nginx:1.31.8-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606
# Alpine fixes land before a new nginx image; the layer refreshes when this file or the digest changes
RUN apk upgrade --no-cache
# the image entrypoint renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/
ENV WEB_CANONICAL_HOST=uliss.home
ENV WEB_AUTH_HOST=auth.uliss.home
ENV NGINX_ENVSUBST_FILTER=^WEB_
COPY module/web/nginx/http/default.conf.template /etc/nginx/templates/default.conf.template
# compose selects these with NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates-tls
COPY module/web/nginx/tls/default.conf.template /etc/nginx/templates-tls/default.conf.template
COPY module/web/nginx/uliss-app.conf /etc/nginx/snippets/uliss-app.conf
COPY --from=build /app/module/web/dist /usr/share/nginx/html