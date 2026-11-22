# План задач: модуль «ядро студии» (Фаза 1)

> **Версия:** 1.7.0
> **Дата:** 2026-11-22
> **Роль:** TechLead
> **Входы:** `doc/requirements/studio.md` (approved, v0.9.0), `doc/requirements/profile.md` (approved, v0.4.0), `doc/architecture.md` v1.7.0, `doc/contracts.md` v1.5.0
> **Ветка:** `feature/studio-phase-2` (PR #8)
> **Статус:** M0–M13 выполнены; **M14 (профиль, аватары, просмотр разделов)** — T-74…T-78 в работе по плану §4.13.

## 1. Текущее состояние

- Реализованы M0–M9: каркас, схема (**7 миграций**), auth, студия и персонал, залы и курсы,
  расписание, docker-деплой на 8080, онбординг и реферальная ссылка, преподаватель по умолчанию
  у курса, длительность сеанса из курса, матрица видимости UI, коды ошибок по §9, страховки схемы. **65 тестов** зелёные.
- Требования — **v0.4.0 (approved)**. Архитектура и контракты — **v1.3.1** (Architect, 2026-11-22),
  индекс разделов в шапке; изменения 1.1.0 из `contracts.md` §0 реализованы в M8.
- **База проверок 2026-11-22, 22:1x** (ветка `feature/studio-phase-2`, после M9): `tsc` server — 0,
  `tsc` client — 0, eslint — 0; прогнаны **все** наборы: app 5/5, db 7/7, auth 8/8, studios 15/15,
  m4 5/5, m5 10/10, isolation 5/5, join 7/7, e2e 1/1 — **65/65**.
  `node --test` в песочнице не запускается (spawn EPERM) — наборы запускаются пофайлово:
  `node server/dist/test/<suite>.test.js`.
- Открыты только Q3 (несколько студий) и Q8 (роль «родитель») — вне M8.
- Решение **D7** (трактовка матрицы 4.1 для куратора) — на подтверждение при приёмке UI,
  API-задачи не блокирует (§2).
- Клиентская сборка `vite build` в песочнице не запускается (см. §4.2), собирается в Docker.

## 2. Блокеры до старта кодинга

| # | Блокер | Что блокирует | Что нужно от пользователя |
|---|---|---|---|
| ~~**D1**~~ | Схема БД: 9 таблиц + `btree_gist`; поле `studios.referral_code` | — | ✅ закрыт 2026-11-22: «да» получено дважды, включая миграцию 005 |
| ~~**D2**~~ | Q7: присоединение ученика | — | ✅ закрыт 2026-11-22: реферальная ссылка студии, задача **T-32** |
| **D3** | Q3: может ли пользователь быть в нескольких студиях | Только UI-переключатель студий, задача `B-02` | Ответ «да/нет» |
| **D4** | Q8: роль «родитель» | Вне Фазы 1, задача `B-03` | Не требуется для старта |
| ~~**D5**~~ | Список npm-зависимостей (§3) | — | ✅ закрыт 2026-11-22, пакеты установлены |
| ~~**D6**~~ | Нет PostgreSQL и Docker (§4) | — | ✅ закрыт 2026-11-22: PostgreSQL 18, база `studioflow` |
| **D7** | Трактовка матрицы 4.1: «Команда» — owner/admin, «Ученики» — отдельная вкладка для куратора (`architecture.md` §14.4) | UI-задачи **T-44**, **T-48** | Подтвердить при приёмке UI; T-37…T-43, T-45…T-47, T-49 не блокирует |

**Вывод:** M0–M9 выполнены, открытых технических блокеров нет. Осталось: ручная приёмка UI
по `architecture.md` §14.5 (решение D7).

**Согласовано ранее:** `courses.teacher_membership_id` (миграция 006) — Decision Gate закрыт
2026-11-22, таблица заявок преподавателей не нужна (Q9 закрыт).

## 3. Инструменты: что есть и чего нет

Проверено на машине 2026-11-22.

| Инструмент | Статус | Версия | Комментарий |
|---|---|---|---|
| Node.js | есть | v24.21.0 | bundled runtime DSH; в PATH отсутствует |
| pnpm | есть | 11.28.5 | запускается через Node; в PATH отсутствует |
| npm registry | доступен | HTTP 200 | `pnpm view react version` → 19.3.1 |
| git | есть | 2.56.1 | из GitHub Desktop, в PATH отсутствует |
| PostgreSQL | **есть** | 18 | локально `postgres://postgres@127.0.0.1:5432/studioflow`; в Docker — том `pgdata` |
| `btree_gist` | есть | — | миграция 004 применилась |
| Docker | **есть** | — | `docker compose` на 8080, api healthy |
| VS Build Tools | **нет** | — | native-модули не собрать → только префиксы с prebuilt-бинарниками |
| winget | есть | — | можно ставить пакеты (нужны права администратора) |

### 3.1. Зависимости (подтверждены, не меняются в M8)

| Пакет | Где | Зачем |
|---|---|---|
| `fastify`, `@fastify/jwt` | server | HTTP и JWT (ACC-3) |
| `@node-rs/argon2` | server | хеширование паролей |
| `pg` | server | драйвер PostgreSQL |
| `zod` | server | валидация тел запросов (NFR-4) |
| `react`, `react-dom`, `react-router-dom` | client | UI и маршруты |
| `vite`, `@vitejs/plugin-react`, `tailwindcss` | client | сборка и стили |
| `typescript`, `eslint`, `prettier` | всё | strict, lint |
| `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` | всё | типы |

**Новые зависимости в M8 не добавляются** — в том числе для UI-тестов: DOM-проверки ROL-11/12
выполняются вручную в браузере, автоматизируются только API-сценарии (`node:test`).

**Сознательно не берём:** ORM, `luxon`/`date-fns`, `tsx`, любой UI-кит кроме Tailwind,
`jsdom`/`testing-library` (новая зависимость + отдельный раннер).

### 3.2. Рабочая схема запуска

```
pnpm typecheck   # tsc --noEmit во всех пакетах
pnpm lint        # eslint
pnpm test        # vitest
```

Node и pnpm не в PATH — запускать через полный путь
`C:\Users\vfedu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`.
В песочнице вместо `pnpm run`:

```
node node_modules/typescript/lib/tsc.js -p server/tsconfig.json
node node_modules/typescript/lib/tsc.js -p client/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js .
node server/dist/test/<suite>.test.js      # DATABASE_URL обязателен, запуск пофайлово
```

## 4. Декомпозиция

> **Решение пользователя 2026-11-22:** реализация ограничена **HTML-прототипом**.
> Задачи M0–M5 (сервер, БД, React) переводятся в статус `deferred` и не ставятся в работу,
> пока не будут закрыты D1, D5, D6. Актуальный трек — раздел 4.0.

> **Обновление 2026-11-22:** D1, D5, D6 закрыты, сервер и клиент реализованы (M0–M7).
> Границы M8 — требования v0.4.0.

### 4.0. Трек «HTML-прототип» (историческое решение, не актуально)

Файлы: `prototype/index.html`, `prototype/app.js`, `prototype/logic.test.mjs`.
Ограничения: без сервера, без БД, без внешних зависимостей; данные в `localStorage`;
проверка — `node prototype/logic.test.mjs`.

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| P-01 | Модель данных прототипа: студия с рабочими часами, участники с набором ролей, курсы, залы, сеансы; миграция демо-данных | `prototype/app.js` | в консоли доступна модель; старые данные не ломают загрузку | STU-1…STU-3, ACC, STF, ROL |
| P-02 | Экран «Студия»: название, часовой пояс, рабочие часы по дням, архивация, сброс демо | `prototype/index.html`, `prototype/app.js` | часы сохраняются и применяются в расписании | STU-1…STU-3, STU-6 |
| P-03 | RBAC: переключатель действующего участника, объединение ролей, скрытие действий и запрет правок | `prototype/app.js` | под ролью «ученик» нельзя создать сеанс; под «куратор» можно | ROL-1…ROL-10 |
| P-04 | Экран «Команда»: список участников с ролями, добавление по email существующего аккаунта, смена ролей, передача владения, деактивация | `prototype/index.html`, `prototype/app.js` | ошибка «пользователь не зарегистрирован»; нельзя остаться без владельца | STF-1…STF-9 |
| P-05 | Каталог курсов вместо групп: направление, уровень, тип, длительность, вместимость, уникальность 2–140, архивация | `prototype/index.html`, `prototype/app.js` | дубль имени отклоняется; 141 символ отклоняется | CLS-1…CLS-6 |
| P-06 | Расписание: сеансы курсов, проверка рабочих часов, конфликты зала и преподавателя, общий просмотр для всех ролей | `prototype/index.html`, `prototype/app.js` | сеанс вне рабочих часов отклоняется с сообщением | SCH-1…SCH-7, ROM-5 |
| P-07 | Тесты прототипа под новую модель | `prototype/logic.test.mjs` | покрыты RBAC, рабочие часы, 140 символов, последний владелец, конфликты | все выше |

### 4.1. M0–M5: M0 выполнен, далее открыто

Стек из раздела 3 в силе. **2026-11-22 пользователь подтвердил продолжение реализации**: D5 закрыт
(пакеты установлены, список в §3.1), M0 выполнен. D1 (схема БД) и D6 (PostgreSQL) открыты —
M1+ не начинать до их закрытия. *(Исторический статус; D1 и D6 закрыты 2026-11-22.)*

### M0. Каркас — выполнено 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-01 | Монорепо и инструменты: workspace, tsconfig strict, eslint, prettier, `.gitignore`, `.env.example` | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.gitignore` | install + typecheck + lint | ✅ выполнено (vitest → `node:test`, §4.2) |
| T-02 | Каркас сервера: Fastify, конфиг из env, конверт ошибок, `GET /health` | `server/**` | `/health` → 200; ошибка → конверт | ✅ выполнено, 3 теста |
| T-03 | Каркас клиента: Vite + React + TS + Tailwind, маршрутизация | `client/**` | сборка клиента проходит | ⚠️ код и typecheck готовы, `vite build` не проверен (§4.2) |
| T-04 | Окружение БД: PostgreSQL, `btree_gist`, миграции, пул | `server/src/db/**`, `migrations/**` | миграция на чистой БД | ✅ выполнено |

### 4.2. Отклонения окружения (2026-11-22)

Песочница DSH запрещает spawn дочерних процессов с пайпами (`EPERM`), поэтому проверки идут
напрямую через node, а не через `pnpm run`:

| Что | Штатно | В песочнице |
|---|---|---|
| Тесты сервера | `vitest run` | `node:test` + `node server/dist/test/<suite>.test.js` пофайлово |
| Проверки | `pnpm typecheck/lint/test` | `node node_modules/typescript/lib/tsc.js`, `node node_modules/eslint/bin/eslint.js .` |
| `node_modules` | изолированный линкер pnpm | `nodeLinker: hoisted` — junction-ссылки в песочнице ломаются |
| Сборка клиента | `vite build` | недоступна: esbuild не может запустить сервис |

На обычной машине достаточно `pnpm install && pnpm typecheck && pnpm lint && pnpm test`.

### M1. Схема данных — миграции выполнены 2026-11-22

D1 подтверждён пользователем, D6 закрыт: PostgreSQL 18 локально (`trust` на 127.0.0.1),
база `studioflow`, `DATABASE_URL=postgres://postgres@127.0.0.1:5432/studioflow`.

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-04 | Миграционный механизм: runner, идемпотентность, `schema_migrations` | `server/src/db/migrate.ts`, `server/src/db/pool.ts` | повторный запуск → «нечего применять» | ✅ 5 миграций, повтор идемпотентен |
| T-05 | `users`, `studios`, `studio_working_hours` | `migrations/001_users_studios.sql` | уникальный `lower(email)`, CHECK часов | ✅ накатано |
| T-06 | `memberships`, `membership_roles`, частичный уникальный индекс владельца | `migrations/002_memberships.sql` | второй `owner` → ошибка БД | ✅ тест: SQLSTATE 23505 |
| T-07 | `rooms`, `courses`, уникальность имён, CHECK длины 2–140 | `migrations/003_rooms_courses.sql` | дубль → ошибка; 141 символ → ошибка | ✅ накатано |
| T-08 | `class_series`, `class_sessions`, exclusion-ограничения | `migrations/004_schedule.sql` | пересечения ловятся БД (23P01) | ✅ тесты: зал, преподаватель, отменённый слот |
| T-09 | Слой доступа: пул, транзакции, студийно-ограниченные репозитории | `server/src/db/repositories/*.ts` | запрос без `studioId` невозможен; тест изоляции | ✅ реализовано в модулях, тест isolation |

### M2. Аутентификация и права — T-10, T-11 выполнены 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-10 | `POST /auth/register`, `POST /auth/login`, JWT, argon2 | `server/src/modules/auth/*` | 201/200, `409 EMAIL_TAKEN`, `401 INVALID_CREDENTIALS` | ✅ 8 тестов на реальной БД |
| T-11 | `GET /me` с членствами и ролями | `server/src/modules/auth/routes.ts`, `server/src/modules/access/repository.ts` | пустой `memberships` у нового аккаунта | ✅ тест ACC-4 |
| T-12 | `tenant-guard` + `rbac` (карта прав из `architecture.md` §8) | `server/src/modules/access/*` | 403 `NOT_A_MEMBER`, 403 `FORBIDDEN`, объединение ролей | ✅ `getMembership`, `requireAccess`, `can()`; покрыто тестами M3 |

### M3. Студия и персонал — T-13…T-16 выполнены 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-13 | `POST /studios`: транзакция «студия + 7 строк часов + membership + owner» | `server/src/modules/studios/*` | ровно один owner; часы сохранены | ✅ тест: 201, 7 часов, `myRoles:['owner']` |
| T-14 | `GET /studios/:id`, `PATCH`, `POST /archive` | `server/src/modules/studios/routes.ts` | 403 для не-owner при архивации | ✅ тесты |
| T-15 | Участники: список с фильтром, добавление по email, смена ролей, исключение | `server/src/modules/members/*` | 404/409/`LAST_OWNER`, несколько ролей | ✅ тесты |
| T-16 | `POST /studios/:id/owner-transfer` | `server/src/modules/members/repository.ts` | новый owner, прежний admin | ✅ тест |
| T-17 | Путь ученика: создание аккаунта с временным паролем (STF-9) | `server/src/modules/members/routes.ts` | 201 с `temporaryPassword`, вход по нему работает | ✅ тест: ученик создан и вошёл |
| T-18 | UI: регистрация/вход, создание студии, персонал | `client/src/pages/*`, `client/src/api.ts` | сквозной сценарий в браузере | ✅ код готов, сборка образа web |

### M4. Залы и курсы — выполнено 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-19 | Залы: CRUD, архивация, `409 ROOM_IN_USE` | `server/src/modules/rooms/*` | `409 ROOM_NAME_TAKEN`, `422` вместимость, `409` при удалении занятого | ✅ 3 теста |
| T-20 | Курсы: CRUD, архивация, 2–140 символов, набор длительностей | `server/src/modules/courses/*` | 141 символ → 422, дубль → 409 | ✅ тесты |
| T-21 | UI: залы и курсы | `client/src/pages/RoomsTab.tsx`, `client/src/pages/CoursesTab.tsx` | создание, архивация, удаление через интерфейс | ✅ |

### M5. Расписание — выполнено 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-22 | Серии: генерация дат, материализация, рабочие часы, лимит 52 недели | `server/src/modules/schedule/repository.ts` | серия Пн/Ср за 2 недели → 4 сеанса | ✅ |
| T-23 | Конфликты: предпроверка и перехват SQLSTATE 23P01 | `server/src/modules/schedule/repository.ts` | 409 `ROOM_CONFLICT` / `TEACHER_CONFLICT` с `details` | ✅ |
| T-24 | `GET /schedule`: период, фильтры, лимит 92 дня | `server/src/modules/schedule/routes.ts` | фильтры по залу, преподавателю, курсу | ✅ |
| T-25 | Мутации: PATCH, DELETE, cancel, удаление серии | `server/src/modules/schedule/routes.ts` | отменённый сеанс освобождает слот | ✅ |
| T-26 | UI расписания: период, фильтры, создание серии и разового, отмена | `client/src/pages/ScheduleTab.tsx` | создание серии и просмотр периода | ✅ |
| T-27 | Тесты изоляции и прав | `server/test/isolation.test.ts` | 403 `NOT_A_MEMBER`, роли, общий просмотр расписания | ✅ 4 теста |
| T-28 | E2E-сценарий §12 | `server/test/e2e-studio.test.ts` | сквозной сценарий | ✅ (до v0.4.0) |

### M6. Локальный деплой (Docker Compose) — выполнено 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| D-01 | Compose: `db` + `api` + `web`, healthchecks, volume, restart | `docker-compose.yml` | `docker compose config` валиден | ✅ |
| D-02 | Образ API: сборка `tsc`, прод-запуск, миграции при старте | `server/Dockerfile`, `deploy/entrypoint.sh` | контейнер поднимается, `/health` → 200 | ✅ api healthy, миграции применились |
| D-03 | Образ клиента: Vite build → Caddy (статика + `/api` proxy) | `client/Dockerfile`, `deploy/Caddyfile` | страница на `:8080` | ✅ web отдаёт StudioFlow |
| D-04 | Документация и переменные | `deploy/README.md`, `.env.compose.example` | инструкция воспроизводима | ✅ |
| D-05 | Первый запуск и smoke-тест | — | `curl :8080/health` → 200 | ✅ 200; по пути исправлены: том PG18, `allowBuilds`, `tsconfig.base.json`, префикс `/api/v1` |

### M7. Онбординг и реферальная ссылка — выполнено 2026-11-22

| ID | Задача | Файлы | Готово, когда | Статус |
|---|---|---|---|---|
| T-29 | Миграция 005: `referral_code` + уникальный индекс + бэкфилл | `migrations/005_referral_code.sql` | у всех студий уникальный код | ✅ проверено на отдельной БД: 2 студии → 2 уникальных кода, без NULL |
| T-30 | Генерация кода при создании, `referralCode`/`referralUrl` в `POST /studios` и `GET /studios/:id` | `modules/studios/referral.ts`, `repository.ts`, `routes.ts` | коллизия → повторная генерация | ✅ |
| T-31 | `PATCH /api/v1/studios/:id/referral` | `modules/studios/routes.ts` | 200 / 422 `INVALID_REFERRAL` / 409 `REFERRAL_TAKEN` / 403 | ✅ |
| T-32 | Публичные `GET /join/:code`, `POST /join/:code/register`, `POST /join/:code/join` | `modules/join/*`, `app.ts` | роль `student`, дубль → 409, старый код → 404 | ✅ |
| T-33 | Онбординг: выбор «создать студию / присоединиться» | `client/src/pages/OnboardingPage.tsx`, `StudioPage.tsx` | ACC-5, ACC-6 | ✅ |
| T-34 | Страница `/join/:code` | `client/src/pages/JoinPage.tsx`, `App.tsx` | REF-5, REF-6 | ✅ |
| T-35 | Редактирование ссылки в карточке студии | `client/src/pages/StudioPage.tsx` | REF-3, REF-4 | ✅ |
| T-36 | Тесты: миграция, join, смена кода, права; существующие наборы | `server/test/join.test.ts`, `db.test.ts` | все наборы зелёные | ✅ 7 новых, всего 46 на момент M7 (после M8 — 55) |

### M8. Требования v0.4.0 — выполнено 2026-11-22

Основание: `architecture.md` v1.2.0, `contracts.md` v1.2.0. Новых таблиц, кроме миграции 006,
нет; новых зависимостей нет.

Проверки для **каждой** задачи M8: `tsc` server и client = 0, eslint = 0, целевые наборы
тестов из критерия — зелёные. Клиентская сборка проверяется в Docker (`vite build` в песочнице
не работает, §4.2).

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| **T-37** | Миграция 006: `courses.teacher_membership_id` + составной FK `(studio_id, teacher_membership_id) → memberships (studio_id, id)` `ON DELETE SET NULL (teacher_membership_id)` | `migrations/006_course_teacher.sql`, `server/test/db.test.ts` | миграция применилась, повторный запуск — «нечего применять»; удаление членства обнуляет ссылку в курсе; вставка преподавателя чужой студии → SQLSTATE `23503`; тесты db зелёные | CLS-7 |
| **T-38** | Курсы: `teacherMembershipId` в создании/правке, `teacherMembershipId` + `teacherName` в ответах, `PATCH` с `null` снимает преподавателя | `server/src/modules/courses/repository.ts`, `server/src/modules/courses/routes.ts`, `server/test/m4.test.ts` | создание с преподавателем возвращает `teacherName`; `PATCH null` обнуляет (не COALESCE); чужое/неактивное членство или без роли `teacher` → `422 NOT_A_TEACHER`; тесты m4 зелёные | CLS-7, CLS-8 |
| **T-39** | Права: `members.read` только owner/admin; `GET /members?role=student` по `students.write`; новый `GET /studios/:id/teachers` (`membershipId`, `displayName`) по `schedule.read` | `server/src/modules/access/rbac.ts`, `server/src/modules/members/repository.ts`, `server/src/modules/members/routes.ts`, `server/test/isolation.test.ts`, `server/test/studios.test.ts` | куратор: `/members` → 403, `/members?role=student` → 200; ученик и преподаватель: `/teachers` → 200, `/members` → 403; преподаватель без роли `teacher` в `/teachers` не попадает; тесты зелёные | ROL-7, ROL-12, SCH-1 |
| **T-40** | `PATCH /members`: свои роли менять нельзя; владельца выдаёт/снимает только owner; второй owner не доходит до БД | `server/src/modules/members/routes.ts`, `server/src/modules/members/repository.ts`, `server/test/studios.test.ts` | self-PATCH → 403; админ на владельце или с `owner` в наборе → 403; снятие `owner` с последнего → 409 `LAST_OWNER`; нет 500 по `23505`; тесты зелёные | ROL-6, STF-11, ACC-9, STF-5 |
| **T-41** | Сеансы: убрать `durationMin` из `POST /sessions` (разовый и серия); длительность из курса; `teacherMembershipId` необязателен | `server/src/modules/schedule/routes.ts`, `server/src/modules/schedule/repository.ts`, `server/test/m5.test.ts` | `durationMin`/`series.durationMin` → 422 `VALIDATION` с `details.fields`; длительность = `courses.default_duration_min`; преподаватель из курса, явный главнее; нет нигде → 422; `class_series.duration_min` — снимок; тесты m5 зелёные | SCH-1, SCH-2, CLS-7, CLS-8 |
| **T-42** | `PATCH /sessions`: `durationMin` → 422; при переносе сохраняется собственная длительность сеанса | `server/src/modules/schedule/routes.ts`, `server/src/modules/schedule/repository.ts`, `server/test/m5.test.ts` | перенос 120-мин сеанса даёт 120 даже если курс стал 90; `durationMin` → 422; тесты зелёные | SCH-10, CLS-8 |
| **T-43** | `GET /schedule`: идентификатор сеанса — `sessionId` (сейчас `id`); клиент переведён на новое поле | `server/src/modules/schedule/repository.ts`, `client/src/types.ts`, `client/src/pages/ScheduleTab.tsx`, `server/test/m5.test.ts` | ответ и клиент используют `sessionId`; POST и cancel не меняются; тесты зелёные | contracts §7 |
| **T-44** | UI: вкладки по матрице, скрытие действий, удаление поля «Длительность» | `client/src/pages/StudioPage.tsx`, `client/src/pages/ScheduleTab.tsx` | teacher/assistant/student видят только «Расписание»; в DOM нет формы сеанса, «Отменить», «Удалить»; куратор не видит «Команду»; поля длительности нет, `durationMin` не отправляется; преподаватель подставляется из курса, список — `GET /teachers`; скрыто отсутствием, а не `disabled` | ROL-11, ROL-12, CLS-8, SCH-10 |
| **T-45** | UI «Залы»: форма редактирования зала (название, вместимость, описание) | `client/src/pages/RoomsTab.tsx` | «Редактировать» открывает форму с текущими значениями, сохранение через `PATCH`, список обновляется; недоступна роли без `rooms.write` (вкладка скрыта) | ROM-3, ROM-7 |
| **T-46** | UI «Команда»: смена набора ролей участника; ограничения владельца | `client/src/pages/StaffTab.tsx` | чекбоксы ролей в строке участника сохраняются через `PATCH`; «Владелец» в наборе доступен только owner; «Передать владение» — только owner; свои роли не редактируются | STF-11, ACC-9, ROL-6 |
| **T-47** | UI «Курсы»: преподаватель по умолчанию и правка курса (длительность) | `client/src/pages/CoursesTab.tsx` | select преподавателя из `GET /teachers` в создании и правке; форма правки меняет `defaultDurationMin`; в списке `teacherName`; поле скрыто без `courses.write` | CLS-7, CLS-8, ROL-11 |
| **T-48** | UI «Ученики»: отдельная вкладка, добавление ученика, исключение | `client/src/pages/StudentsTab.tsx` (новый), `client/src/pages/StudioPage.tsx`, `client/src/types.ts` | вкладка у owner/admin/curator; список `GET /members?role=student`; добавление с показом временного пароля; исключение; у teacher/assistant/student вкладки нет | STF-9, ROL-12 |
| **T-49** | E2E API по сценарию §12 требований | `server/test/e2e-studio.test.ts` | через API покрыты шаги 1–5 и 9–12: роли, смена набора, длительность из курса, `durationMin` → 422, конфликт зала, изоляция; шаги 6–8 (отсутствие кнопок и вкладок в DOM) — ручная проверка по чек-листу `architecture.md` §14.5; тест зелёный | §12, NFR-1…NFR-4 |

**Порядок внутри M8:** T-37 → T-38 → T-47; T-37 → T-41 → T-42 → T-43 → T-44; T-39 → T-44, T-48;
T-40 → T-46; T-45 независима; T-49 — после T-37…T-43.

**Оценка:** 13 задач, каждая — один цикл Coder + Reviewer. API-часть (T-37…T-43) — 7 задач,
UI (T-44…T-48) — 5 задач, E2E (T-49) — 1.

**Статус M8 от 2026-11-22** (после ревью PR #8): реализовано в коммитах `4fcb304`…`06341a5`,
проверено полным прогоном наборов (55/55) и чтением кода.

| ID | Статус | Чем подтверждено |
|---|---|---|
| T-37 | ✅ закрыто | миграция 006 применилась, повтор идемпотентен; db: обнуление ссылки при удалении членства, `23503` на чужую студию |
| T-38 | ✅ закрыто | m4: `teacherName` в ответе, `PATCH null` снимает, `422 NOT_A_TEACHER` |
| T-39 | ✅ закрыто | isolation: куратор `/members` → 403, `?role=student` → 200, `/teachers` — всем ролям |
| T-40 | ✅ закрыто | `PATCH` по §4 соблюдён; `POST /members` с `owner` — 403/409 без обращения к БД (R-1 закрыт в T-50) |
| T-41 | ✅ закрыто | m5: `durationMin` и `series.durationMin` → 422 с `details.fields` |
| T-42 | ✅ закрыто | m5: перенос сохраняет 120 мин после смены курса на 90 |
| T-43 | ✅ закрыто | `sessionId` в `/schedule`, `client/src/types.ts`, `ScheduleTab` |
| T-44 | ✅ закрыто | вкладки и действия отсутствуют в JSX; ручная приёмка §14.5 не выполнялась (D7) |
| T-45 | ✅ закрыто | `RoomsTab`: форма правки через `PATCH`, список обновляется |
| T-46 | ✅ закрыто | строка владельца не редактируется, чекбокс «Владелец» убран из формы, R-3/R-4 закрыты в T-52 |
| T-47 | ✅ закрыто | `CoursesTab`: select из `GET /teachers`, правка `defaultDurationMin` |
| T-48 | ✅ закрыто | «Исключить» только при `members.write`, R-3 закрыт в T-52 |
| T-49 | ✅ закрыто | сценарий §12 покрыт полностью, включая шаги 2, 3, 5, 12 (T-54) |

### 4.8. M9. Дефекты ревью PR #8 — выполнено 2026-11-22 (8 задач из 8)

Найдены при ревью `feature/studio-phase-2` против `main`. Состав M9 подтверждён пользователем
2026-11-22; каждая задача — один цикл Coder + Reviewer. Спецификации — в таблице задач ниже.

| ID | severity | Дефект | Файл | Задача |
|---|---|---|---|---|
| R-1 | major | `POST /members`: набор с `owner` от не-владельца доходит до БД и возвращает `409 ALREADY_MEMBER` вместо `403 FORBIDDEN` (contracts §4, §9) | `server/src/modules/members/routes.ts:143` | T-50 |
| R-2 | major | Архивная студия: `requireAccess` не смотрит на `studios.archived_at`, участники сохраняют доступ после `POST /archive` (contracts §3, STU-6) | `server/src/modules/access/guard.ts:77` | T-51 |
| R-3 | major | UI показывает действия, которые API всегда отклоняет: «Исключить» у куратора, «Изменить роли» на строке владельца у админа (ROL-11, `architecture.md` §14.2) | `client/src/pages/StudentsTab.tsx:106`, `client/src/pages/StaffTab.tsx:180` | T-52 |
| R-4 | minor | Чекбокс «Владелец» в форме добавления скрыт у всех, включая owner (contracts §4, §14.2) | `client/src/pages/StaffTab.tsx:141` | T-52 |
| R-5 | major | Ошибки расходятся с §9: `500 INTERNAL` на битый JSON, коды `INTERNAL`/`UNAUTHORIZED` вне списка, `details` без `fields` в шести модулях, `ROOM_IN_USE` без `sessionCount`, `TEACHER_CONFLICT` неотличим от `ROOM_CONFLICT`, `INVALID_TIMEZONE`/`INVALID_WORKING_HOURS` не возвращаются | `server/src/app.ts:65`, `{rooms,courses,members,studios,join,auth}/routes.ts`, `schedule/repository.ts` | T-53 |
| R-6 | major | T-49: сквозной сценарий §12 не покрывает шаги 2, 3, 5 (регистрация и смена кода по ссылке) и 12 (доступ из чужой студии) | `server/test/e2e-studio.test.ts` | T-54 |
| R-7 | minor | Контрактные мелочи: `q` в каталоге курсов игнорируется, `weeklyLoadHours` не отдаётся, `weekdays` без CHECK 1–7, `DELETE` серии чужой студии → `200 {deleted:0}` вместо 404, `409 LAST_OWNER` в `PATCH /members` недостижим, границы `from/to` в UTC, `membership_roles` без составного FK | `server/src/modules/{courses,rooms,schedule,members}`, `migrations/002`, `migrations/004` | T-55 |
| R-8 | major | Документы противоречат коду: `contracts.md` §7 и §10 («изменения 1.1.0 ждут реализации», «в реализации M5 поле `id`»), `architecture.md` §1 (46 тестов, «кроме изменений 1–5»), `HANDOFF_CODER.md`/`HANDOFF.md` описывают состояние до M8 | `doc/contracts.md:373,516`, `doc/architecture.md:46`, `HANDOFF_CODER.md:5`, `HANDOFF.md:23` | T-56 |

**Следующий шаг:** задачи переданы Coder. Спецификации:

| ID | Задача | Файлы | Готово, когда | Дефект |
|---|---|---|---|---|
| **T-50** | `POST /members`: `owner` в наборе ролей — только владелец | `server/src/modules/members/routes.ts`, `server/test/studios.test.ts` | admin/curator с `owner` в наборе → `403 FORBIDDEN`, БД не трогается; owner с `owner` → `409 LAST_OWNER` («передача — через `owner-transfer`»); дубль участника по-прежнему `409 ALREADY_MEMBER`; тест | R-1 |
| **T-51** | Архивная студия: доступ только owner | `server/src/modules/access/guard.ts`, `server/src/modules/access/repository.ts`, `server/test/studios.test.ts` | после `POST /archive` не-owner получает `403 NOT_A_MEMBER` на всех студийных эндпоинтах, owner работает; тест | R-2 |
| **T-52** | UI: убрать действия, недоступные роли | `client/src/pages/StudentsTab.tsx`, `client/src/pages/StaffTab.tsx` | у куратора нет «Исключить» в разметке; у админа нет «Изменить роли» для строки владельца; чекбокс «Владелец» в форме добавления виден owner; скрытие только отсутствием в JSX; `tsc` client = 0 | R-3, R-4 |
| **T-53** | Конверт и коды ошибок по §9 | `server/src/app.ts`, `server/src/errors.ts`, `{rooms,courses,members,studios,join,auth}/routes.ts`, `schedule/repository.ts` | битый JSON → 4xx `VALIDATION`, не `500`; 4xx от Fastify не маскируются; `details.fields` во всех модулях; `409 ROOM_IN_USE` с `details.sessionCount`; `TEACHER_CONFLICT` отдельно от `ROOM_CONFLICT` + `details`; `INVALID_TIMEZONE`/`INVALID_WORKING_HOURS` вместо `201`/`500`; тесты зелёные | R-5 |
| **T-54** | E2E: шаги 2, 3, 5, 12 сценария §12 | `server/test/e2e-studio.test.ts` | сценарий §12 покрыт полностью (регистрация по ссылке, смена кода, вступление по ссылке, доступ из чужой студии); тест зелёный; T-49 закрывается | R-6 |
| **T-55** | Контрактные мелочи в коде | `courses/{routes,repository}.ts`, `rooms/repository.ts`, `schedule/{routes,repository}.ts`, `members/routes.ts` | `?q` фильтрует каталог курсов; `weeklyLoadHours` в `GET /rooms`; `DELETE` серии чужой студии → `404`; недостижимая ветка `LAST_OWNER` в `PATCH /members` снята или сделана достижимой; `from/to` считаются в зоне студии; наборы зелёные | R-7 |
| **T-56** | Документы под фактический код | `doc/contracts.md`, `doc/architecture.md`, `HANDOFF.md`, `HANDOFF_CODER.md` | §7/§10 contracts и §1 architecture соответствуют коду; коды ошибок синхронизированы с T-53; версии подняты, индексы разделов обновлены; HANDOFF актуальны | R-8 |
| **T-57** | Миграция 007: CHECK `weekdays` 1–7 + составной FK `membership_roles (studio_id, membership_id)` | `migrations/007_schema_guards.sql`, `server/test/db.test.ts` | ✅ одобрено 2026-11-22, применено: локальная БД — «применено 1», повтор — «нечего применять»; контейнерная — 3 студии / 9 ролей / 2 серии сохранены, api healthy; db 9/9 | R-7 |

**Порядок:** T-53 → T-54, T-56; T-50 → T-52; T-51; T-55 — независимы; T-57 — после
подтверждения схемы. T-56 идёт последним в паре с T-53, потому что описывает его результат.

**Статус M9 от 2026-11-22:** закрыты T-50…T-57 (коммиты `6af2cde`…`ba46ea7`), наборы 65/65,
`tsc` 0/0, eslint 0. T-57 одобрена пользователем и применена: миграция 007 (CHECK `weekdays` 1–7,
составной FK `membership_roles`) накачена на локальную и контейнерную БД без потерь.

### 4.9. M10. Недельный календарь расписания (требования v0.5.0) — выполнено 2026-11-22

Основание: `doc/requirements/studio.md` v0.5.0 (**approved** 2026-11-22), `architecture.md` v1.4.0
(§14.2, §14.5), `contracts.md` v1.3.2. **Схема БД и API не меняются** — только `client`.

Проверки для каждой задачи: `tsc` client = 0, eslint = 0; API-наборы не меняются (65/65).
UI проверяется вручную по `architecture.md` §14.5 (DOM-тестов нет, §3.1).

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| **T-58** | Каркас недельного календаря: сетка Пн–Вс × время, блоки сеансов, высота пропорциональна длительности, параллельные сеансы делят ширину колонки дня | `client/src/pages/ScheduleTab.tsx` | сеанс стоит в своём дне и минуте начала; высота блока ∝ длительности; два сеанса в одном слоте видны рядом и не перекрываются | SCH-6, SCH-11, SCH-14 |
| **T-59** | Навигация по неделям и шапка: «предыдущая / следующая / сегодня», подпись диапазона дат (Пн–Вс, пояс студии), подсветка текущего дня, липкая шапка дат | `ScheduleTab.tsx` | сдвиг диапазона на 7 дней перезагружает сеансы; «сегодня» возвращает текущую неделю; диапазон подписан; шапка не уезжает при вертикальном скролле | SCH-13, SCH-18 |
| **T-60** | Блок сеанса и карточка: время, курс, зал, преподаватель; узкий/широкий режим; клик открывает карточку; отменённые — с пометкой и без блокировки слота | `ScheduleTab.tsx` | в блоке минимум время и курс; остальное в карточке; отменённый сеанс виден с пометкой «отменён» | SCH-12, SCH-15 |
| **T-61** | Действия по праву: создание из свободного места, перенос, отмена, удаление; у teacher/assistant/student элементов нет в разметке | `ScheduleTab.tsx`, `client/src/pages/StudioPage.tsx` | у куратора все действия есть и работают; у ученика нет «Создать», «Перенести», «Отменить», «Удалить» (не `disabled`) | SCH-16, ROL-11 |
| **T-62** | Шкала по рабочим часам и адаптивность: видимый диапазон = рабочие часы, ночные сеансы расширяют шкалу, горизонтальный скролл дней на узком экране | `ScheduleTab.tsx` | при пустой ночи шкала 09:00–22:00 из часов студии; при сеансе в 07:00 — шкала расширена; на 375px все 7 дней доступны прокруткой | SCH-17, SCH-18 |

**Порядок:** T-58 → T-59, T-60 → T-61; T-62 — после T-58 (общая сетка).
**Оценка:** 5 задач, каждая — один цикл Coder + Reviewer; один экран, новых зависимостей нет.
**Приёмка:** шаг 13 сценария §12 требований + чек-лист календаря в `architecture.md` §14.5.

**Статус M10 от 2026-11-22:** T-58…T-62 закрыты одним изменением
`client/src/pages/ScheduleTab.tsx` (сетка недели, навигация, карточка, действия по правам,
шкала рабочих часов и скролл). `tsc` client 0, `tsc` server 0, eslint 0, API-наборы 65/65.
Ручная приёмка по §14.5 остаётся за пользователем (D7).

### 4.10. M11. Цвет курса, рабочие часы и «Команда» (требования v0.6.0) — выполнено 2026-11-22

Основание: `doc/requirements/studio.md` v0.6.0 (**approved**), `architecture.md` v1.5.0,
`contracts.md` v1.4.0. **Меняется схема:** `courses.color` — Decision Gate закрыт пользователем
2026-11-22 (text + CHECK по 12 кодам), миграция **008**.

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| **T-63** | Миграция 008: `courses.color text NOT NULL DEFAULT 'violet'` + CHECK по 12 кодам + детерминированный бэкфилл `hashtext(id) % 12` | `migrations/008_course_color.sql`, `server/test/db.test.ts` | миграция применяется на существующей БД без потерь; значение вне палитры → `23514`; существующие курсы получают разные цвета; повтор — «нечего применять» | CLS-9 |
| **T-64** | API курсов: `color` в create/patch и в ответах, валидация палитры → `422 VALIDATION` с `details.fields.color` | `server/src/modules/courses/*`, `server/test/m4.test.ts` | создание с цветом возвращает его; `PATCH { color: 'pink' }` меняет; `'#ff00ff'` → 422; тесты m4 зелёные | CLS-9 |
| **T-65** | UI «Курсы»: выбор цвета из палитры в форме создания и правки, показ цвета в списке | `client/src/pages/CoursesTab.tsx`, `client/src/types.ts` | цвет выбирается из 12 вариантов, сохраняется, виден в списке курсов; `tsc` client 0 | CLS-9 |
| **T-66** | Календарь: рабочие часы студии (SCH-19), цвет курса в блоках и в pop-up (SCH-21), pop-up поверх слота (SCH-20), адаптив ≤767px — один день с переключателем (SCH-18) | `client/src/pages/ScheduleTab.tsx`, `client/src/types.ts` | часы подписаны и зоны вне них отделены; блоки окрашены цветом курса; окно открывается поверх блока и не сдвигает страницу; на 375px — режим одного дня | SCH-18…SCH-21 |
| **T-67** | «Команда» — только сотрудники; «Ученики» — только чистые ученики (без дублей) | `client/src/pages/StaffTab.tsx`, `client/src/pages/StudentsTab.tsx` | в «Команде» нет участников только с ролью `student`; в «Учениках» нет участников с ролью сотрудника; куратор видит всех учеников | STF-13, STF-14, Q11 |

**Порядок:** T-63 → T-64 → T-65, T-66; T-67 независима.
**Оценка:** 5 задач; T-63 меняет схему (миграция 008), остальное — API курса и клиент.
**Приёмка:** шаги 14–15 сценария §12 требований + `architecture.md` §14.5.

**Статус M11 от 2026-11-22:** T-63…T-67 закрыты (коммиты `9620762` и этот). Миграция 008 применена
на локальной и контейнерной БД (4 курса получили цвета), API курсов отдаёт `color`, UI «Курсы»
позволяет выбрать цвет, календарь окрашивает блоки цветом курса, pop-up открывается поверх слота,
часы студии подписаны, ≤767px — режим одного дня. `tsc` 0/0, eslint 0, наборы 67/67
(db 10, m4 5 с цветом). Ручная приёмка UI по §14.5 — за пользователем.

### 4.11. M12. Компоновка расписания и виджет студии (требования v0.7.0) — выполнено 2026-11-22

Основание: `doc/requirements/studio.md` v0.7.0 (**approved**), `architecture.md` v1.6.0,
`contracts.md` v1.4.0. Схема БД и API не меняются — только `client`.

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| **T-68** | Виджет студии слева на вкладке расписания: название, пояс, часы по дням; форма правки часов и пояса по `studio.write` | `client/src/pages/ScheduleTab.tsx` | часы видны по 7 дням; «Изменить» только у owner/admin; сохранение через `PATCH /studios` меняет часы; ошибки 422 показываются | STU-7, STU-8 |
| **T-69** | Компоновка: левая колонка «виджет студии → форма создания», справа календарь; <1024px — один столбец | `ScheduleTab.tsx` | на 1280px две колонки в нужном порядке, на 900px блоки друг под другом без перекрытий | SCH-22, SCH-16 |
| **T-70** | Компактные фильтры в шапке карточки календаря (навигация, зал, преподаватель, курс) | `ScheduleTab.tsx` | отдельного блока фильтров нет; всё в одной строке шапки | SCH-23 |
| **T-71** | Вертикальный фит: раздел занимает высоту вьюпорта, шкала масштабируется, прокрутка только внутри сетки | `ScheduleTab.tsx` | страница не прокручивается; шапка дней и сетка в высоте вьюпорта; при переполнении прокручивается только сетка | SCH-24 |
| **T-72** | Текущий день: цветная заливка колонки и заголовка; линия текущего времени в колонке сегодня, обновление раз в 30 с | `ScheduleTab.tsx` | колонка сегодня залита; линия на текущем времени пояса студии, сдвигается без перезагрузки | SCH-25, SCH-26 |

**Порядок:** T-68 и T-69 вместе (один макет) → T-70 → T-71 → T-72.
**Приёмка:** шаг 16 сценария §12 + чек-лист календаря в `architecture.md` §14.5.

**Статус M12 от 2026-11-22:** T-68…T-72 закрыты одним изменением
`client/src/pages/ScheduleTab.tsx`: двухколоночная компоновка, виджет студии с правкой часов,
компактные фильтры в шапке, вертикальный фит (`h-[calc(100vh-230px)]` + расчёт масштаба шкалы
через `ResizeObserver`), заливка текущего дня и линия времени. `tsc` client 0, `tsc` server 0,
eslint 0, API-наборы 67/67. Ручная приёмка по §14.5 — за пользователем.

### 4.12. M13. «Команда»: назначение ролей вместо добавления (v0.8.0) — выполнено 2026-11-22

Основание: doc/requirements/studio.md v0.8.0 (approved), rchitecture.md v1.6.0. Только клиент.

**T-73** — раздел «Команда»: вместо формы добавления по email — поле «Назначить роли участнику»
(поиск GET /members?q=, включая учеников), редактор набора ролей без owner, сохранение
PATCH /members; для владельца и собственных ролей — пояснение без сохранения. Список ниже
остаётся только для сотрудников, ученики добавляются во вкладке «Ученики».

Файлы: client/src/pages/StaffTab.tsx. 	sc client 0, eslint 0.

### 4.13. M14. Профиль, аватары и просмотр разделов (v0.9.0 + profile v0.4.0) — выполнено 2026-11-22

Основание: `doc/requirements/studio.md` v0.9.0, `doc/requirements/profile.md` v0.4.0 (обе approved),
`architecture.md` v1.7.0, `contracts.md` v1.5.0, миграция 009 уже накатана (локально).

| ID | Задача | Файлы | Готово, когда | Требования |
|---|---|---|---|---|
| **T-74** | API профиля: `GET /me` с новыми полями и `avatarUrl`; `PATCH /me` (имя, фамилия* , телефон, соцсеть, мессенджер, `about`; `email` запрещён); `POST /me/password` | `server/src/modules/auth/*`, `server/test/auth.test.ts` | `PATCH` сохраняет поля, пустые имя/фамилия → 422 `details.fields`; `email` в теле → 422; смена пароля: неверный текущий → 401, короткий → 422, вход по новому работает; в ответах нет `passwordHash` | PRF-2…PRF-9 |
| **T-75** | Аватары: `POST /me/avatar` (multipart, jpeg/png/webp ≤ 2 МБ), `DELETE /me/avatar`, публичный `GET /avatars/{key}`; файлы на томе `uploads/avatars`, в `users.avatar_key` ключ | `server/src/modules/auth/routes.ts`, `server/src/modules/auth/avatar.ts` (новый), `server/src/app.ts`, `server/test/auth.test.ts` | png 300 КБ → 200 и `avatarUrl`; pdf/5 МБ → 422 `details.fields.avatar`; `DELETE` → 204 и `avatarUrl: null`; неизвестный key → 404; файл лежит в томе | PRF-11, Q18 |
| **T-76** | Право `members.list` (все, кроме `student`) для `GET /members`; в ответах `avatarUrl`, `about`, `email` только при `members.write`; то же в `GET /teachers` | `server/src/modules/access/rbac.ts`, `server/src/modules/members/*`, `server/test/studios.test.ts`, `server/test/isolation.test.ts` | teacher видит список сотрудников без email; student → 403; owner видит email; аватары в ответах | ROL-13, ROL-14, PRF-13 |
| **T-77** | UI «Профиль»: вкладка для всех; поля и аватар (превью, загрузка, удаление), «о себе», членства и роли read-only, смена пароля, выход | `client/src/pages/ProfilePage.tsx` (новый), `client/src/App.tsx`, `client/src/types.ts`, `client/src/api.ts` | профиль доступен любой роли и аккаунту без студии; обязательные имя/фамилия дают 422 при пустых; аватар загружается и виден после перезагрузки | PRF-1…PRF-13 |
| **T-79** | Аватары в списках: компонент `Avatar` (img или заглушка с инициалами) в строках «Команды» и «Учеников» | `client/src/components/Avatar.tsx` (новый), `client/src/pages/StaffTab.tsx`, `StudentsTab.tsx`, `client/src/types.ts` | у участника с аватаром в списке видно изображение; без аватара — инициалы; `Member` содержит `avatarUrl`/`about` | PRF-13, Q17 |`n| **T-78** | Видимость разделов: «Курсы» на просмотр всем (без кнопок), «Команда» на просмотр curator/teacher/assistant (без управления), ученик без «Команды»/«Учеников»; аватары в списках | `client/src/pages/StudioPage.tsx`, `CoursesTab.tsx`, `StaffTab.tsx`, `StudentsTab.tsx` | owner/admin — полный набор; curator/teacher/assistant видят «Курсы» и «Команду» без управления; student видит только «Расписание», «Курсы», «Профиль» | ROL-12…ROL-15 |

**Порядок:** T-74 → T-76; T-75 после T-74 (общий `/me`); T-77 после T-74/T-75 (нужны API);
T-78 после T-76 (права) — можно параллельно с T-77.
**Оценка:** 5 задач; меняется только API профиля/прав и клиент, схема уже накатана.

**Статус M14 от 2026-11-22:** T-74…T-78 закрыты. API: `GET/PATCH /me`, `POST /me/password`, `POST/DELETE /me/avatar`, публичный `GET /avatars/{key}` (файлы в `uploads/avatars`), право `members.list`, `avatarUrl`/`about` в списках, email только при `members.write`. Клиент: вкладка «Профиль» (поля, аватар, пароль, членства, выход), «Курсы» на просмотр всем, «Команда» на просмотр без управления, ученик без «Команды»/«Учеников». Миграция 009 применена на локальной и контейнерной БД. Наборы 70/70, `tsc` 0/0, eslint 0. **T-79:** аватары в списках «Команда»/«Ученики» — выполнено (`client/src/components/Avatar.tsx`, заглушка с инициалами при отсутствии файла).

## 5. Граф зависимостей

```
T-01 → T-02 → T-04 → T-05 → T-06 ─┐
        └──→ T-03                 ├→ T-08 → T-09 → T-10 → T-11 → T-12
              T-05 → T-07 ────────┘

T-12 → T-13 → T-14
       T-13 → T-15 → T-16, T-17, T-18
T-12 → T-19, T-20 → T-21
T-19, T-20 → T-22 → T-23 → T-24 → T-25 → T-26 → T-28
T-12 → T-27

M7: T-29 → T-30 → T-31
    T-29 → T-32 → T-34
    T-30 → T-35
    T-33 → T-36, T-34 → T-36

M8: T-37 → T-38 → T-47
    T-37 → T-41 → T-42, T-43 → T-44
    T-39 → T-44, T-48
    T-40 → T-46
    T-45 (независима)
    T-37…T-43 → T-49

M9: T-53 → T-54, T-56
    T-50 → T-52
    T-51, T-55 (независимы)
    T-57 — после подтверждения схемы (получено 2026-11-22)

M10: T-58 → T-59, T-60 → T-61
     T-62 — после T-58

M11: T-63 → T-64 → T-65, T-66
     T-67 (независима)

M12: T-68 + T-69 → T-70 → T-71 → T-72

M14: T-74 → T-76; T-75 после T-74; T-77 после T-74/T-75; T-78 после T-76
```

## 6. Заблокированные задачи (не ставить в работу)

| ID | Задача | Причина |
|---|---|---|
| B-01 | ~~`POST /studios/{id}/join`~~ — снято: Q7 закрыт, задача **T-32** (реферальная ссылка) | — |
| B-02 | UI переключателя студий для пользователя с несколькими студиями | Q3 без ответа |
| B-03 | Роль «родитель» и права на кабинет ребёнка | Q8 без ответа, вне Фазы 1 |
| B-04 | Оптимизация индекса `courses(teacher_membership_id)` | Не блокирует, отложено осознанно (`architecture.md` §5.7, §13.9) |

## 7. Что не входит в Фазу 1

Посещаемость (A2), абонементы (A3), задолженности (A4), личный кабинет ученика (A6),
уведомления, программа лояльности. Задачи по ним не ставятся до подтверждения схемы БД
следующей фазы.

## 8. Порядок сдачи

1. M0 + M1 — каркас и схема; после M1 показать пользователю фактические миграции. ✅
2. M2 — доступ; после M2 проверка прав доступна в изоляции. ✅
3. M3 + M4 — справочники и персонал. ✅
4. M5 — расписание; сдача сквозным сценарием T-28. ✅
5. M6 — деплой docker compose на 8080. ✅
6. M7 — онбординг и реферальная ссылка: T-29…T-36, сдача сценарием §12 требований. ✅
7. M8 — требования v0.4.0: API T-37…T-43 → UI T-44…T-48 → E2E T-49. ✅ все 13 задач закрыты,
   замечания R-1…R-6 устранены в M9 (§4.8).
8. M9 — дефекты ревью PR #8: T-50…T-57 ✅ выполнены 2026-11-22, миграция 007 применена
   на локальной и контейнерной БД.
9. M10 — недельный календарь расписания (требования v0.5.0, SCH-11…SCH-18): T-58…T-62.
   ✅ выполнены 2026-11-22; приёмка UI по §14.5 и шагу 13 §12 — за пользователем.
10. M11 — цвет курса, часы в расписании, pop-up, «Команда»/«Ученики» (v0.6.0): T-63…T-67.
    ✅ выполнены 2026-11-22; миграция 008 применена на локальной и контейнерной БД.
11. M12 — компоновка расписания и виджет студии (v0.7.0): T-68…T-72. ✅ выполнены 2026-11-22;
    приёмка UI по §14.5 и шагу 16 §12 — за пользователем.
12. M14 — профиль, аватары и просмотр разделов (studio v0.9.0, profile v0.4.0): T-74…T-78.
    ⏳ запланировано; миграция 009 накатана на локальную БД.
