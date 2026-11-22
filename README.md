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
| `server/` | Fastify API: конфиг, конверт ошибок, `/health` |
| `client/` | Vite + React + Tailwind: каркас интерфейса |
| `prototype/` | HTML-прототип ядра студии (39 тестов) |
| `doc/` | Требования, архитектура, контракты, план задач |
