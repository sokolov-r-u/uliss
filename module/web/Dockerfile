FROM node:26-alpine3.24
WORKDIR /app

COPY package.json package-lock.json ./
COPY module/web module/web
COPY module/lib/uliss-design-system module/lib/uliss-design-system

RUN npm ci
RUN npm run build -w @uliss/web

FROM nginx:alpine
# the image entrypoint renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/
ENV WEB_CANONICAL_HOST=uliss.home
ENV WEB_AUTH_HOST=auth.uliss.home
ENV NGINX_ENVSUBST_FILTER=^WEB_
COPY module/web/nginx/http/default.conf.template /etc/nginx/templates/default.conf.template
# compose selects these with NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates-tls
COPY module/web/nginx/tls/default.conf.template /etc/nginx/templates-tls/default.conf.template
COPY module/web/nginx/uliss-app.conf /etc/nginx/snippets/uliss-app.conf
COPY --from=0 /app/module/web/dist /usr/share/nginx/html