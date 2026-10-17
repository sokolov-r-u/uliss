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
ENV NGINX_ENVSUBST_FILTER=^WEB_
COPY module/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=0 /app/module/web/dist /usr/share/nginx/html