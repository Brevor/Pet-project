FROM node:24-alpine AS build

WORKDIR /repo
RUN npm install -g pnpm@11.28.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN pnpm install --frozen-lockfile

COPY server ./server
COPY migrations ./migrations

RUN pnpm --filter @studioflow/server exec tsc -p server/tsconfig.json

FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations

WORKDIR /app

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/package.json ./package.json
COPY --from=build /repo/migrations ./migrations
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN addgroup -S app && adduser -S app -G app \
    && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && chown -R app:app /app

USER app

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
