FROM node:24-alpine AS build
WORKDIR /app/admin-web

COPY admin-web/package.json admin-web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=10000

COPY tsconfig.base.json /app/tsconfig.base.json
COPY admin-web ./
ARG VITE_API_BASE_URL=https://api.surroundsmallshops.com/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=build /app/admin-web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
