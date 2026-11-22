# HANDOFF: Coder (M9)

> **Дата:** 2026-11-22 · **Ветка:** `feature/studio-phase-2` (PR #8 открыт)
> **Требования:** `doc/requirements/studio.md` — approved, v0.4.0
> **Архитектура и контракты:** `architecture.md` v1.2.0, `contracts.md` v1.2.0
> **Источник задач:** `doc/tasks/progress.md` §4.8 — **M9, T-50…T-57** (состав подтверждён 2026-11-22)

## 1. Где проект

| Слой | Состояние |
|---|---|
| Код | M0–M8 реализованы: каркас, 6 миграций, auth, студия и персонал, залы, курсы, расписание, реферальная ссылка, онбординг, M8 (преподаватель курса, длительность из курса, матрица видимости UI) |
| Тесты | **55** зелёных: app 3, db 7, auth 8, студии 10, m4 5, m5 9, изоляция 5, join 7, e2e 1 |
| Проверки | `tsc` server 0, `tsc` client 0, eslint 0 (2026-11-22, 21:47) |
| Деплой | `docker compose` (db + api + web на 8080), миграции применяются при старте api |
| Ревью | PR #8 прошёл ревью: найдено 8 дефектов (R-1…R-8), они и есть M9 |

## 2. С чего начать

1. Прочитать: этот файл → `doc/tasks/progress.md` §4.8 (таблица дефектов + таблица задач) →
   `doc/contracts.md` §0, §9 по индексу разделов.
2. Порядок: **T-53 → T-54, T-56**; **T-50 → T-52**; **T-51**; **T-55** независимы;
   **T-57** — только после отдельного «да» пользователя на изменение схемы.
3. Не придумывать задачи сверх M9: если чего-то нет в §4.8 — это вопрос к TechLead.

## 3. Карта M9

| ID | Что | Ключевые файлы | Дефект |
|---|---|---|---|
| T-50 | `POST /members`: `owner` в наборе — только владелец (`403` до БД; owner → `409 LAST_OWNER`) | `server/src/modules/members/routes.ts` | R-1 |
| T-51 | Архивная студия: не-owner → `403 NOT_A_MEMBER` на всех студийных эндпоинтах | `server/src/modules/access/guard.ts`, `access/repository.ts` | R-2 |
| T-52 | UI: убрать «Исключить» у куратора, «Изменить роли» на владельце у админа; вернуть чекбокс «Владелец» owner | `client/src/pages/StudentsTab.tsx`, `StaffTab.tsx` | R-3, R-4 |
| T-53 | Конверт ошибок по §9: 4xx не превращать в 500, `details.fields`, `sessionCount`, `TEACHER_CONFLICT`, `INVALID_TIMEZONE`/`INVALID_WORKING_HOURS` | `server/src/app.ts`, `server/src/errors.ts`, `{rooms,courses,members,studios,join,auth}/routes.ts`, `schedule/repository.ts` | R-5 |
| T-54 | E2E: шаги 2, 3, 5, 12 сценария §12 | `server/test/e2e-studio.test.ts` | R-6 |
| T-55 | Мелочи контракта: `?q` курсов, `weeklyLoadHours`, 404 для чужой серии, `LAST_OWNER` в `PATCH`, зона студии в `from/to` | `courses/*`, `rooms/repository.ts`, `schedule/*`, `members/routes.ts` | R-7 |
| T-56 | Документы под код: статусы §7/§10 contracts, §1 architecture, HANDOFF | `doc/contracts.md`, `doc/architecture.md`, `HANDOFF.md` | R-8 |
| T-57 | Миграция 007: CHECK `weekdays` 1–7, составной FK `membership_roles` | `migrations/007_*.sql`, `server/test/db.test.ts` | R-7 (нужно «да» на схему) |

Детали «готово, когда» — в `doc/tasks/progress.md` §4.8, дублировать не нужно.

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

Наборы: `app`, `db`, `auth`, `studios`, `m4`, `m5`, `isolation`, `join`, `e2e-studio`.
Миграции: `node server/dist/src/db/migrate.js` (нужны `DATABASE_URL`, `MIGRATIONS_DIR`).
Деплой: `docker compose up -d --build api web`, приложение — `http://localhost:8080`.

## 5. Ловушки

1. `pnpm run` в песочнице падает (spawn EPERM) — только `node` напрямую.
2. `vite build` локально не собирается — клиент проверяется в Docker.
3. `node --test` со списком файлов падает — запускать по одному; вывод в пайп (`2>&1`, `| Select-Object`) ломается в песочнице, запускай без перенаправления.
4. PostgreSQL 18 в контейнере требует том `/var/lib/postgresql`, не `.../data`.
5. pnpm 11: настройка `allowBuilds`, не `onlyBuiltDependencies`; `nodeLinker: hoisted`.
6. Миграция обязана сохранять данные: в локальной БД есть студии пользователя.
7. `.env` не в git (игнорируется) — не коммить и не печатать `JWT_SECRET`/`POSTGRES_PASSWORD`.
8. Скрытие в UI — отсутствие элемента в разметке, а не `disabled`/CSS (`architecture.md` §14).
9. `membership_single_owner` — частичный уникальный индекс: второй `owner` в БД невозможен, `23505` маппится в `409 ALREADY_MEMBER`. Для T-50 нужен осмысленный код, а не «уже участник».
10. Ошибки пересечений: ловить `23P01` и различать зал/преподавателя (`TEACHER_CONFLICT`), см. T-53.
11. Правки в `doc/*.md` — CRLF и завершающий перевод строки, как в существующих файлах.
12. Не менять `migrations/001…006` — они применены; новое только в `007`.

## 6. Точки входа

| Что | Где |
|---|---|
| RBAC | `server/src/modules/access/rbac.ts`, `guard.ts` |
| Курсы | `server/src/modules/courses/repository.ts`, `routes.ts` |
| Расписание | `server/src/modules/schedule/repository.ts`, `routes.ts` |
| Участники | `server/src/modules/members/repository.ts`, `routes.ts` |
| Залы | `server/src/modules/rooms/repository.ts`, `routes.ts` |
| UI | `client/src/pages/*`, типы — `client/src/types.ts` |

## 7. Definition of Done задачи M9

- `tsc` server и client — 0, eslint — 0.
- Целевые наборы задачи зелёные; после T-54 — все наборы (55 + новые).
- Изменения не выходят за файлы, перечисленные в `progress.md` §4.8.
- Для T-56: версии подняты, индексы разделов в шапках актуальны, коды ошибок синхронизированы с T-53.
- Для T-57: миграция накатывается на существующую БД без потерь, повторный запуск — «нечего применять».
- Коммит в `feature/studio-phase-2` после каждой задачи; push делает пользователь.
