FROM node:26-alpine3.24
WORKDIR /app

COPY package.json .
COPY module/web module/web
COPY module/lib/uliss-design-system module/lib/uliss-design-system

RUN npm install
RUN npm run build -w @uliss/web

FROM nginx:alpine
COPY module/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=0 /app/module/web/dist /usr/share/nginx/html