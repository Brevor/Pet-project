FROM node:24-alpine AS build

WORKDIR /repo
RUN npm install -g pnpm@11.28.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN pnpm install --frozen-lockfile

COPY client ./client

RUN pnpm --filter @studioflow/client run build

FROM caddy:2-alpine

COPY --from=build /repo/client/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
