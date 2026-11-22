# StudioFlow — CRM для танцевальной студии

Монорепозиторий: сервер (Node.js + Fastify) и клиент (React + Vite + Tailwind).
Прототип интерфейса — в [`prototype/`](prototype/index.html), требования и архитектура — в [`doc/`](doc).

## Запуск

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Node.js и pnpm в этой среде не в PATH, запускать через полный путь:

```
C:\Users\vfedu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
C:\Users\vfedu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs
```

Установка пакетов с локальным хранилищем (песочница не даёт писать вне рабочей папки):

```bash
node <path>\pnpm.mjs install --store-dir C:\Users\vfedu\Downloads\Pet-project\.pnpm-store
```

## Структура

| Путь | Что |
|---|---|
| `server/` | Fastify API: конфиг, конверт ошибок, `/health`, БД и миграции |
| `client/` | Vite + React + Tailwind: каркас интерфейса |
| `prototype/` | HTML-прототип ядра студии (39 тестов) |
| `doc/` | Требования, архитектура, контракты, план задач |
| `migrations/` | SQL-миграции схемы |
| `deploy/` | Caddy и инструкция локального деплоя |

## Локальный деплой

```bash
# 1. добавить в .env: POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
# 2. запустить Docker Desktop
docker compose up -d --build
```

Приложение: `http://localhost:8080`, health: `http://localhost:8080/health`.
Подробности — [`deploy/README.md`](deploy/README.md).
