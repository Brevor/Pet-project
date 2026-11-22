# Архитектура: модуль «ядро студии»

> **Версия:** 1.0.0
> **Дата:** 2026-11-22
> **Роль:** Architect
> **Основание:** `doc/requirements/studio.md` (Status: approved), `doc/proposal.md`
> **Связанные:** `doc/contracts.md`

## 1. Вердикт анализа

**Не укладывается в существующую архитектуру — потому что архитектуры ещё нет.**
`doc/architecture.md` отсутствовал, кода в `src/`, `client/`, `server/` нет, `package.json` нет.
Стек из `proposal.md` §6 подходит без изменений, поэтому ниже зафиксирована первая версия.

**Требуется подтверждение пользователя (Decision Gate, `proposal.md` §10):**
схема БД — 9 новых таблиц и расширение PostgreSQL `btree_gist`. До подтверждения Coder
не начинает реализацию.

## 2. Границы

Входит (Фаза 1, расширена 2026-11-22): аутентификация, студия и рабочие часы, участники и роли,
залы, каталог курсов, расписание сеансов.

Не входит: посещаемость, абонементы, личный кабинет ученика, уведомления, программа лояльности.
Эти модули не влияют на модель данных ниже — точки расширения появляются вместе с ними.

## 3. Топология

```
┌──────────────────────────┐        HTTPS/JSON         ┌──────────────────────────┐
│  Клиент: React + Vite    │  Authorization: Bearer    │  API: Node.js + Fastify  │
│  Tailwind, SPA           │ ────────────────────────► │  REST /api/v1            │
│  (студия, персонал,      │ ◄──────────────────────── │  JWT, RBAC, tenant guard │
│   залы, курсы, расписание)│         ошибки 4xx         └───────────┬──────────────┘
└──────────────────────────┘                                       │ SQL
                                                          ┌────────▼─────────┐
                                                          │   PostgreSQL     │
                                                          │  + btree_gist    │
                                                          └──────────────────┘
```

Один инстанс API и БД, без Kubernetes (`proposal.md` §6). Клиент — SPA, серверного рендеринга нет.

## 4. Компоненты API

| Модуль | Ответственность | Требования |
|---|---|---|
| `auth` | регистрация, вход, выдача JWT, `GET /me` | ACC-1, ACC-3, ACC-4 |
| `tenant-guard` | поиск членства по `studioId` из пути, отказ 403/404 | STU-4, ACC-4 |
| `rbac` | вычисление прав как объединения ролей, отказ 403 | ROL-1…ROL-10, NFR-2 |
| `studios` | создание, настройки, рабочие часы, архивация | STU-1…STU-6 |
| `members` | добавление по email, наборы ролей, владение, исключение | STF-1…STF-10 |
| `rooms` | CRUD залов, архивация, запрет удаления занятого | ROM-1…ROM-4 |
| `courses` | CRUD курсов, архивация, уникальность названия | CLS-1…CLS-6 |
| `schedule` | серии, материализация сеансов, конфликты, выдача расписания | SCH-1…SCH-9, ROM-5, ROM-6 |
| `errors` | единый конверт ошибок, маппинг SQLSTATE | NFR-4 |

## 5. Модель данных

Все таблицы, кроме `users`, содержат `studio_id NOT NULL` с индексом (STU-5).
Ссылочная целостность между сущностями студии — составными внешними ключами
`(studio_id, <id>) → parent(studio_id, id)`, чтобы объект одной студии нельзя было привязать к другой.

### 5.1. `users` — глобальный аккаунт (без `studio_id`)

| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| email | text | NOT NULL, UNIQUE по `lower(email)` |
| password_hash | text | NOT NULL (argon2id) |
| display_name | text | NULL |
| is_active | bool | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Аккаунт создаётся самостоятельной регистрацией (ACC-1) или ИТ-администратором системы (ACC-2).
Таблицы приглашений нет — по требованию STF-1.

### 5.2. `studios`

`id uuid PK`, `name text NOT NULL`, `timezone text NOT NULL DEFAULT 'Europe/Moscow'`,
`contacts jsonb`, `referral_code text NOT NULL`, `archived_at timestamptz NULL`,
`created_at timestamptz NOT NULL DEFAULT now()`.

`referral_code` — публичный код студии (REF-1): 8 символов base32 (`a-z0-9`), генерируется при
создании студии, уникальный индекс `UNIQUE (lower(referral_code))`. Меняется владельцем или
администратором (REF-3); при смене старый код освобождается и перестаёт работать (REF-4).
Членства к коду не привязаны — смена кода не влияет на уже присоединившихся учеников.

### 5.3. `studio_working_hours`

`studio_id uuid FK`, `weekday smallint` (1–7, ISO), `opens_at time`, `closes_at time`,
`is_closed bool NOT NULL DEFAULT false`; PK `(studio_id, weekday)`;
CHECK `is_closed OR closes_at > opens_at`.

### 5.4. `memberships`

`id uuid PK`, `studio_id uuid FK`, `user_id uuid FK`, `status text` (`active` | `disabled`),
`created_at`; UNIQUE `(studio_id, user_id)`; индекс `(user_id)`.

### 5.5. `membership_roles`

`membership_id uuid FK`, `studio_id uuid FK` (денормализация для ограничений),
`role text` CHECK IN (`owner`, `admin`, `curator`, `teacher`, `assistant`, `student`);
PK `(membership_id, role)`; **частичный UNIQUE `(studio_id) WHERE role = 'owner'`** — гарантия
ровно одного владельца (STF-5, STF-7).

### 5.6. `rooms`

`id uuid PK`, `studio_id`, `name text NOT NULL`, `capacity int NOT NULL CHECK (capacity > 0)`,
`description text`, `archived_at timestamptz`, `created_at`;
UNIQUE `(studio_id, lower(name))` — ROM-2; индекс `(studio_id)`.

### 5.7. `courses`

`id uuid PK`, `studio_id`, `name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 140)` (CLS-2),
`direction text`, `level text` CHECK IN (`beginner`, `intermediate`, `advanced`, `none`) (CLS-3),
`kind text` CHECK IN (`group`, `individual`), `default_duration_min int` CHECK IN (45, 60, 75, 90, 120) (CLS-5),
`capacity int CHECK (capacity > 0)`, `archived_at timestamptz`, `created_at`;
UNIQUE `(studio_id, lower(name))`.

### 5.8. `class_series` — правило повторения

`id uuid PK`, `studio_id`, `course_id`, `room_id`, `teacher_membership_id uuid FK → memberships`,
`weekdays smallint[] NOT NULL` (каждое 1–7), `start_time time NOT NULL`, `duration_min int NOT NULL`,
`starts_on date NOT NULL`, `until date NOT NULL`, `created_at timestamptz`.
CHECK `until >= starts_on`; CHECK `array_length(weekdays,1) > 0`.

Материализация: при создании серии в той же транзакции генерируются `class_sessions` на все
даты от `starts_on` до `until` по указанным дням недели. Горизонт ограничен
`until <= starts_on + interval '52 weeks'` — защита от случайной серии на десятилетие.

### 5.9. `class_sessions` — сеанс расписания

`id uuid PK`, `studio_id`, `series_id uuid NULL FK → class_series`, `course_id`, `room_id`,
`teacher_membership_id`, `starts_at timestamptz NOT NULL`, `ends_at timestamptz NOT NULL`,
`status text NOT NULL DEFAULT 'scheduled'` CHECK IN (`scheduled`, `cancelled`), `created_at`.
CHECK `ends_at > starts_at`.

Ограничения пересечений (ROM-5, SCH-3) — на уровне БД, чтобы гонка двух запросов не создала конфликт:

```sql
ALTER TABLE class_sessions ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'scheduled');

ALTER TABLE class_sessions ADD CONSTRAINT no_teacher_overlap
  EXCLUDE USING gist (teacher_membership_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'scheduled');
```

Индексы: `(studio_id, starts_at)`, `(studio_id, room_id, starts_at)`, `(studio_id, teacher_membership_id, starts_at)`.

Инвариант, проверяемый в сервисе: `teacher_membership_id` принадлежит этой студии и имеет роль
`teacher` среди `membership_roles`. Внешним ключом не выражается — покрывается тестом.

### 5.10. Что сознательно не создаётся

- `invitations` — приглашений нет (STF-1).
- `attendance`, `subscriptions`, `student_profiles` — следующая фаза.
- Таблица «прав» — матрица 4.1 статична и живёт в коде (`rbac`), а не в БД.

## 6. Ключевые сценарии

**Создание студии (STU-1).** Одна транзакция: `users` уже существует → `studios` →
`studio_working_hours` (7 строк) → `memberships` → `membership_roles(role='owner')`.
Ответ 201 только после коммита.

**Добавление участника (STF-1, STF-9).** Поиск `users` по `lower(email)`; нет — 404 `USER_NOT_FOUND`
(STF-2); есть — `memberships` + набор ролей (STF-4); дубль — 409 `ALREADY_MEMBER` (STF-3).
Письма не отправляются. Для роли `student` при отсутствии аккаунта он создаётся в той же
транзакции, пароль устанавливается по ссылке из письма (STF-9).

**Создание серии (SCH-1, SCH-2).** Валидация: курс и зал активны, преподаватель — участник с ролью
`teacher`, время в рабочих часах студии (SCH-5), `until` в пределах горизонта. Генерация дат и
`INSERT` сеансов одной транзакцией. Нарушение exclusion-ограничения (SQLSTATE `23P01`) → откат,
поиск конфликтующего сеанса → 409 с его идентификатором и временем (SCH-3, ROM-5).

**Передача владения (STF-5).** Транзакция: снять `owner` у текущего, назначить новому;
частичный уникальный индекс делает невозможным состояние «два владельца» или «ноль владельцев»
в момент коммита.

**Архивация зала/курса (ROM-3, CLS-4).** `archived_at` вместо удаления; архивные не попадают
в выборку для новых сеансов, существующие сеансы сохраняются. Удаление зала запрещено при наличии
сеансов (ROM-4).

**Регистрация владельца (REF-8).** Отдельный адрес регистрации: аккаунт + студия + рабочие часы
+ владелец одной транзакцией (STU-1). Реферальный код генерируется в этой же транзакции; коллизия
кода — повторная генерация (до 5 попыток), затем 500.

**Присоединение по реферальной ссылке (REF-1…REF-7).** Публичный маршрут без JWT:
`GET /join/{code}` находит студию по `lower(referral_code)`; нет — 404. Регистрация
`POST /join/{code}/register` создаёт `users` + `memberships` + `membership_roles('student')`
одной транзакцией и выдаёт JWT. Авторизованный пользователь — `POST /join/{code}/join`:
создаёт только членство; повторное обращение — 409 `ALREADY_MEMBER`. Роли сотрудника по ссылке
не выдаются никогда (REF-7): роль всегда `student`.
## 7. Время и часовые пояса

- Все моменты времени — `timestamptz`, хранение в UTC (NFR-3).
- `studios.timezone` — единственный источник локального времени студии.
- Рабочие часы и `class_series.start_time` — локальное время студии.
- Материализация серии в `timestamptz` выполняется в часовом поясе студии
  (`(starts_on + start_time) AT TIME ZONE studios.timezone`), поэтому переход на летнее время
  не сдвигает сеансы.
- Клиент отображает время в поясе студии, а не браузера.

## 8. Авторизация и права

JWT: `sub` (user id), `iat`, `exp` (24 ч). Студия в токен не зашивается — она берётся из пути и
проверяется по `memberships` (не зависит от ответа на Q3).

Без JWT доступны: `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /join/{code}`,
`POST /join/{code}/register`. Остальные маршруты требуют токен.

Каждый запрос `/api/v1/studios/{studioId}/**` проходит `tenant-guard`: активное членство → набор
ролей; иначе 403 `NOT_A_MEMBER`. Затем `rbac` проверяет действие:

| Действие | Роли |
|---|---|
| `studio.read` | любая роль |
| `studio.write` | owner, admin |
| `studio.archive` | owner |
| `members.read` | owner, admin, curator |
| `members.write` (сотрудники) | owner, admin |
| `students.write` | owner, admin, curator |
| `rooms.write` | owner, admin, curator |
| `courses.write` | owner, admin, curator |
| `schedule.read` | любая роль |
| `schedule.write` | owner, admin, curator |

Права объединяются: участник с ролями `teacher` + `curator` получает `schedule.write` (ROL-2).
Ограничение одной роли не отменяет право, выданное другой.

## 9. Изоляция tenant

- `studioId` присутствует в пути каждого студийного эндпоинта и обязателен в репозиториях —
  запрос без него невозможен по типу.
- Составные внешние ключи исключают межстудийные связи.
- RLS в Фазе 1 не включается: изоляция держится на уровне доступа к данным плюс тест NFR-1.
  Включение RLS — отдельное решение, не для текущей фазы.

## 10. Ошибки

Единый конверт `{ "error": { "code", "message", "details" } }`; коды в `doc/contracts.md` §9.
422 — валидация, 409 — конфликт (уникальность, пересечение, занятый зал), 403 — нет права,
404 — объект не найден или принадлежит другой студии (не раскрываем существование).

## 11. Требует решения (Known Unknowns)

| # | Вопрос | Как влияет на архитектуру | Что заложено сейчас |
|---|---|---|---|
| **Q3** | Может ли пользователь состоять в нескольких студиях? | `memberships` допускает несколько записей на пользователя; при ответе «нет» добавляется уникальный индекс `(user_id) WHERE status='active'` и экран выбора студии не нужен | Таблица поддерживает оба варианта, ограничение не поставлено |
| **Q8** | Нужна ли роль «родитель»? | Добавит значение в CHECK `membership_roles.role` и строки в матрицу прав | Роль отсутствует |

## 12. Трассировка требований

| Требования | Таблицы | Эндпоинты | Компонент |
|---|---|---|---|
| STU-1…STU-6 | `studios`, `studio_working_hours`, `memberships`, `membership_roles` | `/auth/register`, `/studios` | `studios` |
| ACC-1…ACC-8, STF-1…STF-10 | `users`, `memberships`, `membership_roles` | `/auth/*`, `/me`, `/studios/{id}/members` | `auth`, `members` |
| REF-1…REF-8 | `studios.referral_code`, `memberships` | `/join/{code}`, `/studios/{id}/referral` | `studios`, `members` |
| ROL-1…ROL-10 | `membership_roles` | все | `rbac` |
| ROM-1…ROM-6 | `rooms`, `class_sessions` | `/studios/{id}/rooms` | `rooms` |
| CLS-1…CLS-6 | `courses` | `/studios/{id}/courses` | `courses` |
| SCH-1…SCH-9 | `class_series`, `class_sessions` | `/studios/{id}/schedule`, `/sessions` | `schedule` |
| NFR-1…NFR-4 | все | все | `tenant-guard`, `errors` |

## 13. Риски и отложенные решения

1. **`btree_gist`** — расширение PostgreSQL, нужное для exclusion-ограничений. Если недоступно,
   конфликты проверяются в транзакции с `SELECT … FOR UPDATE` (медленнее, риск гонки выше).
2. **Материализация серий** ограничена горизонтом 52 недели и объёмом строк. Продление серии —
   отдельная задача, вне Фазы 1.
3. **Нет refresh-токенов**: сессия 24 часа, повторный вход по паролю. Пересмотр — при появлении
   требования о долгоживущей сессии (это A6.1, следующая фаза).
4. **Нет аудита изменений** (кто и когда менял роли): не входит в Фазу 1.
5. **Удаление серии** затрагивает только будущие сеансы, прошедшие остаются (SCH-8); история
   посещаемости появится с модулем A2.
6. **Перебор реферальных кодов.** Публичный `GET /join/{code}` позволяет перебирать коды: нужен
   rate limit по IP (в Фазе 1 — простой счётчик на инстансе), а код из 8 символов base32
   (≈ 40 бит) делает перебор невыгодным.
