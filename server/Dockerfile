FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY admin-web/package.json admin-web/package.json
COPY miniapp/package.json miniapp/package.json
COPY server/package.json server/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=10000 --workspace @nearby-shop/server

COPY tsconfig.base.json ./
COPY server ./server
RUN npm run build --workspace @nearby-shop/server

FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:migrate", "--workspace", "@nearby-shop/server"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/runtime/package.json server/runtime/package-lock.json ./server/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --audit=false --fetch-retries=5 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=10000 --omit=peer --prefix server

COPY --chown=node:node --from=build /app/server/dist ./server/dist
USER node
EXPOSE 3000
CMD ["node", "server/dist/server.js"]
