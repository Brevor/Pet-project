# HANDOFF: Coder

> **Дата:** 2026-11-22 · **Ветка:** `feature/studio-phase-2` (22 коммита впереди origin)
> **Требования:** `doc/requirements/studio.md` — **approved**, v0.4.0
> **Архитектура и контракты:** `architecture.md` v1.1.0, `contracts.md` v1.1.0
> **План работ:** `doc/tasks/progress.md`, раздел **M8 (T-37…T-49)** — источник задач

## 1. Где проект

| Слой | Состояние |
|---|---|
| Код | M0–M7 реализованы: каркас, 5 миграций, auth, студия и персонал, залы, курсы, расписание, реферальная ссылка, онбординг |
| Тесты | **46** зелёных: app 3, db 5, auth 8, студии 9, m4 3, m5 6, изоляция 4, e2e 1, join 7 |
| Деплой | `docker compose` (db + api + web на 8080), миграции применяются при старте api |
| Документы | Требования v0.4.0 approved; архитектура и контракты обновлены; M8 разложен на 13 задач |
| Готово к работе | Да: блокеров нет, нужна только реализация M8 |

## 2. С чего начать новую сессию

1. Прочитать: этот файл → `doc/tasks/progress.md` §M8 → `doc/architecture.md` §14 → `doc/contracts.md` §0.
2. Взять **T-37** (миграция 006) — она разблокирует T-38 и T-41.
3. Соблюдать порядок: `T-37 → T-38 → T-47`, `T-37 → T-41 → T-42 → T-43 → T-44`,
   `T-39 → T-44, T-48`, `T-40 → T-46`, `T-45` независима, `T-49` — в конце.
4. Не придумывать задачи сверх M8: если чего-то нет в плане — это вопрос к TechLead.

## 3. Карта задач M8 (детали — в progress.md)

| ID | Что | Ключевые файлы |
|---|---|---|
| T-37 | Миграция 006: `courses.teacher_membership_id`, составной FK, `ON DELETE SET NULL` | `migrations/006_course_teacher.sql`, `server/test/db.test.ts` |
| T-38 | Курсы: `teacherMembershipId` в create/update, `teacherName` в ответах, `PATCH null` снимает | `server/src/modules/courses/*` |
| T-39 | Права: `members.read` → owner/admin, `GET /members?role=student` по `students.write`, новый `GET /studios/:id/teachers` | `server/src/modules/access/rbac.ts`, `members/*` |
| T-40 | `PATCH /members`: свои роли нельзя, владельца — только owner, корректные 403/409 | `server/src/modules/members/*` |
| T-41 | Сеансы: убрать `durationMin` из POST, длительность из курса, преподаватель из курса | `server/src/modules/schedule/*` |
| T-42 | `PATCH /sessions`: `durationMin` → 422, перенос сохраняет длительность сеанса | `server/src/modules/schedule/*` |
| T-43 | `GET /schedule`: `sessionId` вместо `id`, клиент перевести | `server/src/modules/schedule/*`, `client/src/types.ts` |
| T-44 | UI: вкладки и действия по матрице, удалить поле длительности | `client/src/pages/StudioPage.tsx`, `ScheduleTab.tsx` |
| T-45 | UI «Залы»: редактирование зала | `client/src/pages/RoomsTab.tsx` |
| T-46 | UI «Команда»: смена ролей, ограничения владельца | `client/src/pages/StaffTab.tsx` |
| T-47 | UI «Курсы»: преподаватель по умолчанию, правка длительности | `client/src/pages/CoursesTab.tsx` |
| T-48 | UI «Ученики»: новая вкладка, добавление/исключение | `client/src/pages/StudentsTab.tsx` |
| T-49 | E2E API по сценарию §12 | `server/test/e2e-studio.test.ts` |

## 4. Как запускать в этой среде

Node и pnpm не в PATH:

```
C:\Users\vfedu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
C:\Users\vfedu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs
```

Проверки (напрямую, `pnpm run` падает с EPERM):

```
node node_modules/typescript/lib/tsc.js --noEmit -p server/tsconfig.json
node node_modules/typescript/lib/tsc.js --noEmit -p client/tsconfig.json
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/lib/tsc.js -p server/tsconfig.json
$env:DATABASE_URL='postgres://postgres@127.0.0.1:5432/studioflow'
node server/dist/test/<suite>.test.js
```

Миграции: `node server/dist/src/db/migrate.js` (нужны `DATABASE_URL`, `MIGRATIONS_DIR`).
Деплой: `docker compose up -d --build api web`, приложение — `http://localhost:8080`.

## 5. Ловушки, на которых уже спотыкались

1. `pnpm run` в песочнице падает (spawn EPERM) — запускать инструменты через `node`.
2. `vite build` локально не собирается — сборка клиента только в Docker.
3. `node --test` со списком файлов падает — запускать по одному или общим runner-скриптом.
4. PostgreSQL 18 в контейнере требует том `/var/lib/postgresql`, не `.../data`.
5. pnpm 11: настройка `allowBuilds`, не `onlyBuiltDependencies`; `nodeLinker: hoisted`.
6. Миграция обязана сохранять существующие данные — в контейнерной БД есть студии пользователя.
7. `durationMin` принимается в двух местах (API сеансов и UI) — убирать синхронно.
8. Роль по умолчанию — «ученик»; повышение ролей только владельцем/администратором.
9. Скрытие в UI — отсутствие элемента в разметке, а не `disabled`/CSS (architecture §14).

## 6. Точки входа

| Что | Где |
|---|---|
| RBAC | `server/src/modules/access/rbac.ts`, `guard.ts` |
| Курсы | `server/src/modules/courses/repository.ts`, `routes.ts` |
| Расписание | `server/src/modules/schedule/repository.ts`, `routes.ts` |
| Участники | `server/src/modules/members/repository.ts`, `routes.ts` |
| Залы | `server/src/modules/rooms/repository.ts`, `routes.ts` |
| UI | `client/src/pages/*`, типы — `client/src/types.ts` |

## 7. Definition of Done

- `tsc` server и client — 0, eslint — 0.
- Целевые наборы тестов каждой задачи зелёные; после T-49 — все, ≥ 46 + новые.
- Миграция 006 накатывается на существующую БД без потерь, повторный запуск — «нечего применять».
- `docker compose up -d --build api web` поднимается; сценарий §12 проходит.
- Коммит в `feature/studio-phase-2`; push делает пользователь (из агента недоступен).