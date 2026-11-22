#!/bin/sh
set -e

echo "→ применение миграций"
node dist/src/db/migrate.js

echo "→ запуск API на ${HOST}:${PORT}"
exec node dist/src/server.js
