FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY admin-web/package.json admin-web/package.json
COPY miniapp/package.json miniapp/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace @nearby-shop/server --include-workspace-root

COPY tsconfig.base.json ./
COPY server ./server
RUN npm run build --workspace @nearby-shop/server

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY admin-web/package.json admin-web/package.json
COPY miniapp/package.json miniapp/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace @nearby-shop/server

COPY --from=build /app/server/dist ./server/dist
EXPOSE 3000
CMD ["node", "server/dist/server.js"]

