# Контракты API: ядро студии

> **Версия:** 1.0.0
> **Дата:** 2026-11-22
> **Роль:** Architect
> **Основание:** `doc/architecture.md`, `doc/requirements/studio.md` (approved)
> **Статус:** проект контракта, реализация не начата

## 1. Общие правила

- База: `/api/v1`. Формат — JSON, `Content-Type: application/json`.
- Аутентификация: `Authorization: Bearer <jwt>` для всех эндпоинтов, кроме публичных: `/health`, `/auth/register`, `/auth/login`, `/join/{code}`, `/join/{code}/register`.
- Идентификаторы — UUID v4, строки.
- Моменты времени — ISO 8601 с офсетом (`2026-11-28T12:00:00+03:00`).
  Рабочие часы и время начала серии — локальное время студии без даты (`"18:00"`).
- Пагинация: `?limit=50&offset=0` (limit 1–200, по умолчанию 50). Ответ — `{ "items": [...], "total": n }`.
- Ошибка всегда в одном конверте:

```json
{ "error": { "code": "ROOM_CONFLICT", "message": "Зал занят", "details": { "sessionId": "…" } } }
```

- Студия всегда в пути (`/studios/{studioId}/…`); несовпадение членства — 403, чужая сущность — 404.
- Идемпотентность POST не гарантируется; повторная отправка формы может создать дубль (кроме мест,
  где явно указан 409 по уникальности).

## 2. Аутентификация

### POST /auth/register

```json
{ "email": "owner@studio.ru", "password": "…", "displayName": "Анна" }
```

`201` → `{ "token": "…", "expiresIn": 86400, "user": { "id": "…", "email": "…", "displayName": "Анна" } }`
Ошибки: `409 EMAIL_TAKEN`, `422 VALIDATION` (email, пароль ≥ 8 символов).

### POST /auth/login

```json
{ "email": "owner@studio.ru", "password": "…" }
```

`200` → `{ "token": "…", "expiresIn": 86400, "user": { … } }`
Ошибки: `401 INVALID_CREDENTIALS` (без указания, что именно неверно).

### GET /me

`200` →

```json
{
  "user": { "id": "…", "email": "…", "displayName": "Анна" },
  "memberships": [
    { "studioId": "…", "studioName": "Dance Lab", "roles": ["owner"], "status": "active" }
  ]
}
```

Пустой массив `memberships` — валидное состояние (ACC-4): клиент показывает экран создания студии.

## 3. Студии

### POST /studios

```json
{
  "name": "Dance Lab",
  "timezone": "Europe/Moscow",
  "workingHours": [
    { "weekday": 1, "opensAt": "09:00", "closesAt": "22:00", "isClosed": false },
    { "weekday": 7, "opensAt": "09:00", "closesAt": "22:00", "isClosed": true }
  ]
}
```

`201` → `{ "studio": { "id": "…", "name": "Dance Lab", "timezone": "Europe/Moscow", "workingHours": [ … ] } }`
Создатель получает роль `owner` (STU-1). Ошибки: `422 INVALID_WORKING_HOURS` (нет дней, `opensAt >= closesAt`),
`422 INVALID_TIMEZONE`.

### GET /studios/{studioId}

`200` → `{ "studio": { … }, "myRoles": ["owner"] }`

### PATCH /studios/{studioId}

`{ "name"?: "…", "timezone"?: "…", "workingHours"?: [ … ] }` → `200` тот же объект.
Право: `studio.write`. Ошибки: `403 FORBIDDEN`, `422 …`.

### POST /studios/{studioId}/archive

`204`, пустое тело. Право: `studio.archive` (только owner). После архивации студия доступна только owner.

### PATCH /studios/{studioId}/referral

Смена кода реферальной ссылки (REF-3).

```json
{ "code": "dance-lab" }
```

`200` → `{ "referralCode": "dance-lab", "referralUrl": "/join/dance-lab" }`
Право: `studio.write`. После смены старый код отвечает 404 (REF-4), участники остаются в студии.

| Код | Когда |
|---|---|
| `422 INVALID_REFERRAL` | пусто, короче 3 или длиннее 32, недопустимые символы, зарезервирован |
| `409 REFERRAL_TAKEN` | код занят другой студией |
| `403 FORBIDDEN` | роль не owner/admin |

### GET /join/{code} — публичный

Проверка ссылки перед регистрацией (REF-5).

`200` → `{ "studio": { "id": "…", "name": "Dance Lab", "referralCode": "dance-lab" } }`
`404 REFERRAL_NOT_FOUND` — код не найден.

### POST /join/{code}/register — публичный

Регистрация ученика по ссылке (REF-5). Пользователь не выбирает роль — всегда `student` (REF-7).

```json
{ "email": "student@example.com", "password": "…", "displayName": "Алиса" }
```

`201` → `{ "token": "…", "expiresIn": 86400, "user": { … }, "studio": { … },
"membership": { "roles": ["student"] } }`

Ошибки: `404 REFERRAL_NOT_FOUND`, `409 EMAIL_TAKEN`, `422 VALIDATION`.

### POST /join/{code}/join — с JWT

Присоединение уже авторизованного пользователя (REF-6).

`201` → `{ "membership": { … }, "studio": { … } }`
Ошибки: `404 REFERRAL_NOT_FOUND`, `409 ALREADY_MEMBER`, `401 UNAUTHORIZED`.
### DELETE /studios/{studioId}

Не поддерживается: только архивация (STU-6).

## 4. Участники и роли

### GET /studios/{studioId}/members

`?role=teacher&q=анна&limit=50&offset=0` → `200`

```json
{
  "items": [
    { "membershipId": "…", "userId": "…", "email": "…", "displayName": "Анна",
      "roles": ["teacher", "curator"], "status": "active" }
  ],
  "total": 1
}
```

Право: `members.read`.

### POST /studios/{studioId}/members

Добавление **существующего** аккаунта по email (приглашений нет):

```json
{ "email": "teacher@studio.ru", "roles": ["teacher"] }
```

`201` → `{ "membership": { "membershipId": "…", "userId": "…", "roles": ["teacher"], "status": "active" } }`

| Код | Когда |
|---|---|
| `404 USER_NOT_FOUND` | аккаунт с таким email не зарегистрирован (STF-2) |
| `409 ALREADY_MEMBER` | участник уже в студии (STF-3) |
| `422 UNKNOWN_ROLE` | роль вне фиксированного набора |
| `403 FORBIDDEN` | нет права `members.write` (сотрудники) или `students.write` (только `student`) |

Особый случай: `roles: ["student"]` требует права `students.write` и разрешает создать аккаунт,
если его нет (STF-9) — в этом случае письмо об установке пароля отправляется, роли в письме нет.

### PATCH /studios/{studioId}/members/{membershipId}

```json
{ "roles": ["teacher", "curator"] }
```

`200` → обновлённое членство. Право: `members.write` (роли владельца меняет только `owner`).
Ошибки: `422 UNKNOWN_ROLE`, `409 LAST_OWNER` (попытка снять единственного `owner`), `403 FORBIDDEN`.

### DELETE /studios/{studioId}/members/{membershipId}

`204`. Аккаунт и прошлые сеансы сохраняются (STF-6). Ошибки: `409 LAST_OWNER`, `403 FORBIDDEN`.

### POST /studios/{studioId}/owner-transfer

```json
{ "membershipId": "…" }
```

`204`. Право: только `owner`. Старый владелец становится `admin` (STF-5).
Ошибки: `404 NOT_FOUND`, `422 ALREADY_OWNER`, `403 FORBIDDEN`.

## 5. Залы

### GET /studios/{studioId}/rooms

`?includeArchived=false` → `200`

```json
{ "items": [ { "id": "…", "name": "Зал А", "capacity": 25, "description": "80 м²",
               "archived": false, "weeklyLoadHours": 12.5 } ], "total": 1 }
```

Право: `schedule.read` (просмотр доступен всем ролям студии).

### POST /studios/{studioId}/rooms

```json
{ "name": "Зал А", "capacity": 25, "description": "80 м²" }
```

`201` → `{ "room": { … } }`. Право: `rooms.write`.
Ошибки: `409 ROOM_NAME_TAKEN` (без учёта регистра), `422 VALIDATION` (пустое имя, capacity ≤ 0).

### PATCH /studios/{studioId}/rooms/{roomId}

`{ "name"?, "capacity"?, "description"?, "archived"? }` → `200`. Архивация — `"archived": true`.

### DELETE /studios/{studioId}/rooms/{roomId}

`204`; `409 ROOM_IN_USE`, если у зала есть сеансы (ROM-4) — тело содержит `details.sessionCount`.

## 6. Каталог курсов

### GET /studios/{studioId}/courses

`?includeArchived=false&q=` → `200`

```json
{ "items": [ { "id": "…", "name": "Hip-Hop · начинающие", "direction": "Hip-Hop",
               "level": "beginner", "kind": "group", "defaultDurationMin": 90,
               "capacity": 14, "archived": false } ], "total": 1 }
```

### POST /studios/{studioId}/courses

```json
{ "name": "Hip-Hop · начинающие", "direction": "Hip-Hop", "level": "beginner",
  "kind": "group", "defaultDurationMin": 90, "capacity": 14 }
```

`201`. Право: `courses.write`.
Ошибки: `409 COURSE_NAME_TAKEN`, `422 VALIDATION` (длина имени 2–140, уровень, тип, длительность).
`defaultDurationMin` — только 45, 60, 75, 90, 120 (CLS-5).

### PATCH /studios/{studioId}/courses/{courseId}

`{ "name"?, "direction"?, "level"?, "kind"?, "defaultDurationMin"?, "capacity"?, "archived"? }` → `200`.

### DELETE /studios/{studioId}/courses/{courseId}

`204`; `409 COURSE_IN_USE`, если у курса есть сеансы. Предпочтительно архивирование (CLS-4).

## 7. Расписание

### GET /studios/{studioId}/schedule

`?from=2026-11-23&to=2026-11-29&roomId=&teacherMembershipId=&courseId=`

`200` →

```json
{
  "items": [
    { "sessionId": "…", "courseId": "…", "courseName": "Hip-Hop · начинающие",
      "roomId": "…", "roomName": "Зал А",
      "teacherMembershipId": "…", "teacherName": "Анна Ковалёва",
      "startsAt": "2026-11-23T18:00:00+03:00", "endsAt": "2026-11-23T19:30:00+03:00",
      "status": "scheduled", "seriesId": "…" }
  ],
  "total": 1
}
```

Право: `schedule.read` — доступно всем шести ролям (SCH-7). Диапазон не больше 92 дней:
`422 DATE_RANGE_TOO_LONG`.

### POST /studios/{studioId}/sessions

Два варианта тела — разовый сеанс и серия.

Разовый:

```json
{ "courseId": "…", "roomId": "…", "teacherMembershipId": "…",
  "startsAt": "2026-11-28T12:00:00+03:00", "durationMin": 60 }
```

Серия:

```json
{ "courseId": "…", "roomId": "…", "teacherMembershipId": "…",
  "series": { "weekdays": [1, 3], "startTime": "18:00",
              "startsOn": "2026-11-23", "until": "2026-12-31", "durationMin": 90 } }
```

`201` → `{ "created": 12, "seriesId": "…", "items": [ { "sessionId": "…", "startsAt": "…" } ] }`
Разовый ответ: `created: 1`, `seriesId: null`.

Право: `schedule.write`.

| Код | Когда |
|---|---|
| `409 ROOM_CONFLICT` | зал занят; `details`: `conflictingSessionId`, `startsAt`, `endsAt` (ROM-5) |
| `409 TEACHER_CONFLICT` | преподаватель занят (SCH-3) |
| `422 OUTSIDE_WORKING_HOURS` | сеанс вне рабочих часов или в выходной (SCH-5) |
| `422 DATE_RANGE_TOO_LONG` | `until` позже `startsOn + 52 недели` |
| `422 INVALID_DURATION` | длительность вне 45–120 |
| `422 ARCHIVED_COURSE` / `ARCHIVED_ROOM` | выбран архивный объект |
| `422 NOT_A_TEACHER` | у членства нет роли `teacher` |

При серии конфликт проверяется на всех генерируемых датах, транзакция откатывается целиком.

### PATCH /studios/{studioId}/sessions/{sessionId}

`{ "roomId"?, "teacherMembershipId"?, "startsAt"?, "durationMin"? }` → `200`.
Те же ошибки конфликтов. Правка одного вхождения не меняет серию.

### POST /studios/{studioId}/sessions/{sessionId}/cancel

`200` → `{ "session": { "sessionId": "…", "status": "cancelled" } }` (SCH-9, приоритет Should).

### DELETE /studios/{studioId}/sessions/{sessionId}

`204` — удаляет одно вхождение.

### DELETE /studios/{studioId}/series/{seriesId}

`?futureOnly=true` (по умолчанию `true`) → `200` `{ "deleted": 8 }`.
Удаляются только будущие сеансы серии, прошедшие сохраняются (SCH-8). Право: `schedule.write`.

## 8. Эндпоинт → право

| Эндпоинт | Право |
|---|---|
| `GET /studios/{id}`, `/me` | `studio.read` |
| `PATCH /studios/{id}` | `studio.write` |
| `POST /studios/{id}/archive` | `studio.archive` |
| `GET /studios/{id}/members` | `members.read` |
| `POST/PATCH/DELETE /studios/{id}/members…` | `members.write` |
| `POST …/members` с `roles:["student"]` | `students.write` |
| `POST …/owner-transfer` | `studio.archive` (только owner) |
| `PATCH /studios/{id}/referral` | `studio.write` |
| `GET /join/{code}`, `POST /join/{code}/register` | без авторизации |
| `POST /join/{code}/join` | любой авторизованный пользователь |
| `GET /studios/{id}/rooms`, `/courses`, `/schedule` | `schedule.read` |
| `POST/PATCH/DELETE` залов и курсов | `rooms.write` / `courses.write` |
| `POST/PATCH/DELETE` сеансов и серий | `schedule.write` |

## 9. Коды ошибок

| Код | HTTP | Смысл |
|---|---|---|
| `VALIDATION` | 422 | не прошла валидация полей, `details.fields` |
| `INVALID_CREDENTIALS` | 401 | неверная пара email/пароль |
| `TOKEN_EXPIRED` | 401 | истёк JWT |
| `NOT_A_MEMBER` | 403 | нет членства в студии из пути |
| `FORBIDDEN` | 403 | членство есть, права нет |
| `NOT_FOUND` | 404 | объект не найден или в другой студии |
| `USER_NOT_FOUND` | 404 | нет аккаунта с таким email |
| `EMAIL_TAKEN` | 409 | email уже зарегистрирован |
| `ALREADY_MEMBER` | 409 | участник уже в студии |
| `LAST_OWNER` | 409 | попытка оставить студию без владельца |
| `ROOM_NAME_TAKEN` | 409 | имя зала занято |
| `COURSE_NAME_TAKEN` | 409 | имя курса занято |
| `ROOM_IN_USE` | 409 | у зала есть сеансы |
| `COURSE_IN_USE` | 409 | у курса есть сеансы |
| `ROOM_CONFLICT` | 409 | пересечение по залу |
| `TEACHER_CONFLICT` | 409 | пересечение по преподавателю |
| `OUTSIDE_WORKING_HOURS` | 422 | сеанс вне рабочих часов |
| `DATE_RANGE_TOO_LONG` | 422 | слишком длинная серия или диапазон |
| `UNKNOWN_ROLE` | 422 | роль вне набора |
| `INVALID_REFERRAL` | 422 | недопустимый код реферальной ссылки |
| `REFERRAL_TAKEN` | 409 | код занят другой студией |
| `REFERRAL_NOT_FOUND` | 404 | код не найден |

## 10. Требует решения

**Q7 закрыт** (2026-11-22): присоединение — по реферальной ссылке студии, см.
`PATCH /studios/{id}/referral`, `GET /join/{code}`, `POST /join/{code}/register`,
`POST /join/{code}/join`.

**Q3** (участие в нескольких студиях) на контракты не влияет: студия всегда в пути запроса.
**Q8** (роль «родитель») добавит значение в `roles` и строку в матрицу прав.
