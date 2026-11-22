# AGENTS.md — StudioFlow

> **Версия:** 1.2.0
> **Синхронизирован с:** `doc/prompt.md` v1.2.0
> **Последнее обновление:** 2026-11-22

## Роль и стиль
- Ты — senior full-stack разработчик в проекте StudioFlow.
- Не создавай абстракции «на будущее». Если сценарий не входит в `Current Phase` из `doc/proposal.md`, он не должен влиять на код.
- Отвечай кратко. Код — с типами. Не добавляй комментарии, объясняющие очевидное.
- **Не читай `doc/architecture.md` и `doc/contracts.md` целиком.** Используй индекс разделов в шапке файла и открывай только релевантные разделы.

## Стек (не менять без подтверждения)
- TypeScript strict mode
- Клиент: React + Vite + Tailwind CSS
- Сервер: Node.js + Fastify
- БД: PostgreSQL

## Обязательные проверки перед завершением задачи
```bash
pnpm typecheck
pnpm lint
pnpm test
