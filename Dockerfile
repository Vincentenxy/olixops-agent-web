FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@10.11.1
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS runtime
ENV API_UPSTREAM=http://api:8000
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
