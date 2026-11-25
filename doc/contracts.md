# Контракты API: ядро студии

> **Версия:** 1.5.1
> **Дата:** 2026-11-22
> **Роль:** Architect
> **Основание:** `doc/architecture.md` (v1.7.1), `doc/requirements/studio.md` (approved, v0.9.0), `doc/requirements/profile.md` (approved, v0.4.0)
> **Статус:** действует; соответствует реализации M0–M9. Изменения 1.1.0 (§0) реализованы в M8.
> Изменения 1.3.1 — уточнение семантики полей, которые уже есть в коде (`weeklyLoadHours`, `q`,
> границы периода расписания). Изменения 1.3.2 — требования v0.5.0 (недельный календарь,
> SCH-11…SCH-18) контрактов не касаются: неделя запрашивается тем же `GET /schedule`,
> новых полей и эндпоинтов нет. Изменения 1.4.0 — требования v0.6.0: поле `color` у курса
> (§6, палитра 12 значений, Q12); новых эндпоинтов нет, палитра — константа контракта.

> **Индекс разделов:**
> - §0 Изменения версии 1.1.0
> - §1 Общие правила
> - §2 Аутентификация (`/auth/register`, `/auth/login`, `/me`)
> - §3 Студии (`/studios`, `/studios/{id}`, `/join/{code}`, referral)
> - §4 Участники и роли (`/members`, `/teachers`, `/owner-transfer`)
> - §5 Залы (`/rooms`)
> - §6 Каталог курсов (`/courses`)
> - §7 Расписание (`/schedule`, `/sessions`, `/series`)
> - §8 Эндпоинт → право (сводная таблица)
> - §9 Коды ошибок (сводная таблица)
> - §10 Требует решения (Q3, Q8)

## 0. Изменения версии 1.1.0

| # | Что | Раздел | Требования |
|---|---|---|---|
| 1 | У курса появился преподаватель по умолчанию: `teacherMembershipId` (nullable) в запросах, `teacherMembershipId` + `teacherName` в ответах | §6 | CLS-7 |
| 2 | `POST /sessions`, `PATCH /sessions/{sessionId}` больше не принимают `durationMin`; передача → 422 `VALIDATION` | §7 | CLS-8, SCH-1, SCH-2, SCH-10 |
| 3 | `durationMin` в серии тоже убран; длительность серии — снимок длительности курса | §7 | SCH-2, CLS-8 |
| 4 | `teacherMembershipId` в сеансе необязателен: подставляется преподаватель курса | §7 | CLS-7 |
| 5 | `PATCH /sessions` при переносе сохраняет собственную длительность сеанса | §7 | CLS-8 |
| 6 | `GET /studios/{id}/teachers` — справочник преподавателей для фильтра и формы | §4 | SCH-6, ROL-12 |
| 7 | `members.read` сужен до owner/admin; `GET /members?role=student` доступен по `students.write` | §4, §8 | ROL-7, ROL-12 |
| 8 | Уточнены правила `PATCH /members`: владельца выдаёт и снимает только owner; собственный набор ролей менять нельзя | §4 | ROL-6, STF-11, ACC-9 |
| 9 | Код `422 NOT_A_TEACHER` добавлен в общий список; `422 INVALID_DURATION` больше не возвращается | §7, §9 | CLS-7, SCH-10 |

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
- Неизвестные поля игнорируются, **кроме** перечисленных запрещённых (`durationMin` в §7):
  запрещённое поле — 422 `VALIDATION`, а не молчаливое игнорирование.

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
  "user": { "id": "…", "email": "…", "displayName": "Анна", "firstName": "Анна", "lastName": "Ковалёва",
            "phone": "+7 916 123-45-67", "socialUrl": "https://vk.com/anna", "messengerContact": "@anna",
            "about": "Преподаю hip-hop с 2015 года", "avatarUrl": "/api/v1/avatars/u_8f3a.png" },
  "memberships": [
    { "studioId": "…", "studioName": "Dance Lab", "roles": ["owner"], "status": "active" }
  ]
}
```

Пустой массив `memberships` — валидное состояние (ACC-4): клиент показывает экран создания студии.

`displayName` — вычисляемое: `Имя Фамилия` → `display_name` → email (PRF-9, Q15).
`avatarUrl` — `null`, если аватар не загружен.

### PATCH /me

Личные поля профиля (PRF-2…PRF-5). JWT обязателен, студийный контекст не нужен.

```json
{ "firstName": "Анна", "lastName": "Ковалёва", "phone": "+7 916 123-45-67",
  "socialUrl": "https://vk.com/anna", "messengerContact": "@anna", "about": "…" }
```

`200` → `{ "user": { … } }` в форме `GET /me`.

| Код | Когда |
|---|---|
| `422 VALIDATION` | `firstName`/`lastName` пусты или > 80 символов (обязательны, Q16); `phone` не по формату или > 32; `socialUrl` без схемы `http(s)://` или > 200; `messengerContact` > 100; `about` > 500 — `details.fields.<поле>` |
| `422 VALIDATION` | в теле передан `email` — email является логином и не меняется (PRF-2, Q13) |
| `401 UNAUTHORIZED` | нет или невалидный токен |

### POST /me/avatar

Тело — **сырые байты изображения**, `Content-Type: image/jpeg | image/png | image/webp`, до 2 МБ
(multipart не используется: сервер принимает body как `Buffer`). Файл сохраняется в хранилище
(том), в `users.avatar_key` — ключ (Q18).

`200` → `{ "user": { … } }` с новым `avatarUrl`. Ошибки: `422 VALIDATION`
(`details.fields.avatar`) — неверный тип, размер больше 2 МБ или пустое тело; `401 UNAUTHORIZED`.

### DELETE /me/avatar

`204`. Удаляет файл и обнуляет `avatar_key`; повторный вызов — тоже `204` (идемпотентно).

### POST /me/password

```json
{ "currentPassword": "…", "newPassword": "…" }
```

`204`. Ошибки: `401 INVALID_CREDENTIALS` (текущий неверен), `422 VALIDATION`
(`newPassword` < 8 символов или совпадает с текущим). Текущая сессия остаётся рабочей (PRF-6).

### GET /avatars/{key} — публичный

Отдаёт файл аватара (`Content-Type` по типу изображения, кеш `max-age=86400`).
`404 NOT_FOUND`, если ключ не существует. Доступен без JWT: аватар виден всем участникам (Q17).


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

`204`, пустое тело. Право: `studio.archive` (только owner). После архивации студия доступна только
owner: остальные роли получают `403 NOT_A_MEMBER` на всех студийных эндпоинтах.

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
      "firstName": "Анна", "lastName": "Ковалёва", "avatarUrl": "/api/v1/avatars/u_8f3a.png",
      "about": "Преподаю hip-hop с 2015 года",
      "roles": ["teacher", "curator"], "status": "active" }
  ],
  "total": 1
}
```

Право: `members.list` — **все роли, кроме «ученика»** (owner, admin, curator, teacher, assistant)
видят список сотрудников только для чтения (ROL-14). Исключение по фильтру: `?role=student`
доступен по праву `students.write` (owner, admin, curator) — список учеников (ROL-7).
Управление ролями — `members.write` (owner, admin), см. `PATCH /members`.

`email` отдаётся только ролям с `members.write` (owner, admin); остальным — `null`
(контакты видны всем, email — только управляющим, PRF-2, Q17).
`avatarUrl` и `about` отдаются всем, у кого есть доступ к эндпоинту (Q17).

### GET /studios/{studioId}/teachers

Справочник преподавателей для фильтра расписания и формы сеанса (SCH-1, SCH-6). Только активные
участники с ролью `teacher`. Email не отдаётся.

Право: `schedule.read` — доступно всем шести ролям (ROL-8…ROL-10).

`200` →

```json
{
  "items": [ { "membershipId": "…", "displayName": "Анна Ковалёва",
               "avatarUrl": "/api/v1/avatars/u_8f3a.png", "about": "…" } ],
  "total": 1
}
```

`displayName` — `display_name` аккаунта, при отсутствии — email (тот же fallback, что `teacherName`
в расписании).

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
| `403 FORBIDDEN` | нет права `members.write` (сотрудники) или `students.write` (только `student`); `owner` в наборе ролей может указать только владелец |
| `409 LAST_OWNER` | владелец пытается добавить участника с ролью `owner`: второй владелец невозможен, передача — через `owner-transfer` |

Особый случай: `roles: ["student"]` требует права `students.write` и разрешает создать аккаунт,
если его нет (STF-9) — в этом случае временный пароль возвращается в ответе (`temporaryPassword`),
роли в нём нет.

### PATCH /studios/{studioId}/members/{membershipId}

```json
{ "roles": ["teacher", "curator"] }
```

`200` → обновлённое членство. Набор ролей заменяется целиком, минимум одна роль.
Право: `members.write` (owner, admin).

| Код | Когда |
|---|---|
| `422 UNKNOWN_ROLE` | роль вне набора |
| `403 FORBIDDEN` | администратор меняет набор ролей владельца, добавляет или убирает `owner`; участник меняет собственный набор ролей (ACC-9) |

Передача владения через этот эндпоинт **не выполняется**: `owner` в наборе от администратора —
403, смена владельца — только `POST /owner-transfer`. Снять `owner` с текущего владельца через
`PATCH` нельзя: цель совпадает с членством запроса, поэтому раньше срабатывает 403 (ACC-9);
удаление владельца из студии — `DELETE`, там `409 LAST_OWNER`.

Себе роли не назначаются (ACC-9): `membershipId` из пути совпадает с членством запроса → 403.
Роли владельца меняет только владелец, роли остальных — владелец или администратор.

### DELETE /studios/{studioId}/members/{membershipId}

`204`. Аккаунт и прошлые сеансы сохраняются (STF-6). Ошибки: `409 LAST_OWNER`, `403 FORBIDDEN`.
Если участник — преподаватель по умолчанию у курсов, ссылка в курсах обнуляется (миграция 006).
Удаление преподавателя, у которого есть сеансы или серии, отклоняется ограничением БД — в Фазе 1
сначала переназначают сеансы.

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

`weeklyLoadHours` — сумма длительностей активных (`scheduled`) сеансов зала в текущей неделе
(пн–вс) в часовом поясе студии, в часах с точностью 0.01; `0`, если сеансов нет. Поле вычисляемое,
в БД не хранится.

### POST /studios/{studioId}/rooms

```json
{ "name": "Зал А", "capacity": 25, "description": "80 м²" }
```

`201` → `{ "room": { … } }`. Право: `rooms.write`.
Ошибки: `409 ROOM_NAME_TAKEN` (без учёта регистра), `422 VALIDATION` (пустое имя, capacity ≤ 0).

### PATCH /studios/{studioId}/rooms/{roomId}

`{ "name"?, "capacity"?, "description"?, "archived"? }` → `200`. Архивация — `"archived": true`.
Право: `rooms.write`. Форма редактирования в UI — ROM-7 (§14 architecture).

### DELETE /studios/{studioId}/rooms/{roomId}

`204`; `409 ROOM_IN_USE`, если у зала есть сеансы (ROM-4) — тело содержит `details.sessionCount`.

## 6. Каталог курсов

### GET /studios/{studioId}/courses

`?includeArchived=false&q=` → `200`

```json
{
  "items": [
    { "id": "…", "name": "Hip-Hop · начинающие", "direction": "Hip-Hop",
      "level": "beginner", "kind": "group", "defaultDurationMin": 90,
      "capacity": 14, "teacherMembershipId": "…", "teacherName": "Анна Ковалёва",
      "archived": false }
  ],
  "total": 1
}
```

`teacherMembershipId` и `teacherName` — `null`, если преподаватель по умолчанию не задан (CLS-7).

`color` — цвет курса для блоков в календаре: одно из 12 значений `violet`, `indigo`, `blue`, `sky`,
`teal`, `green`, `lime`, `amber`, `orange`, `red`, `rose`, `pink` (CLS-9). Обязателен в ответах,
необязателен в запросах (по умолчанию `violet`); значение вне палитры → `422 VALIDATION`
с `details.fields.color`. Свободный hex не поддерживается (Q12).

`q` — регистронезависимый поиск подстроки по `name` и `direction`; пустой `q` равнозначен
отсутствию фильтра. Комбинируется с `includeArchived`.

### POST /studios/{studioId}/courses

```json
{ "name": "Hip-Hop · начинающие", "direction": "Hip-Hop", "level": "beginner",
  "kind": "group", "defaultDurationMin": 90, "capacity": 14,
  "teacherMembershipId": "…" }
```

`teacherMembershipId` необязателен (`uuid | null`, по умолчанию `null`). Право: `courses.write`.

`201` → `{ "course": { … } }`.
Ошибки: `409 COURSE_NAME_TAKEN`, `422 VALIDATION` (длина имени 2–140, уровень, тип, длительность),
`422 NOT_A_TEACHER` (членство не в этой студии, неактивно или без роли `teacher`).
`defaultDurationMin` — только 45, 60, 75, 90, 120 (CLS-5).

### PATCH /studios/{studioId}/courses/{courseId}

`{ "name"?, "direction"?, "level"?, "kind"?, "defaultDurationMin"?, "capacity"?,
"teacherMembershipId"?, "archived"? }` → `200`.

- `teacherMembershipId: null` — **снять** преподавателя по умолчанию;
- поле отсутствует — не менять;
- смена `defaultDurationMin` и `teacherMembershipId` **не переписывает** существующие сеансы
  (CLS-8): новые сеансы берут новые значения, старые сохраняют свои.
- Ошибки: `422 NOT_A_TEACHER`, `422 VALIDATION`, `409 COURSE_NAME_TAKEN`.

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

> Идентификатор сеанса в списке расписания — `sessionId`, как в `POST /sessions` и `POST …/cancel`.

Право: `schedule.read` — доступно всем шести ролям (SCH-7). Диапазон не больше 92 дней:
`422 DATE_RANGE_TOO_LONG`.

`from`/`to` — календарные даты в часовом поясе студии (`studios.timezone`), не в UTC: сеанс
в 01:00 местного времени попадает в свою местную дату. Ответ отсортирован по `startsAt`.

### POST /studios/{studioId}/sessions

Два варианта тела — разовый сеанс и серия. **`durationMin` в теле нет ни в одном варианте.**

Разовый:

```json
{ "courseId": "…", "roomId": "…", "teacherMembershipId": "…",
  "startsAt": "2026-11-28T12:00:00+03:00" }
```

Серия:

```json
{ "courseId": "…", "roomId": "…", "teacherMembershipId": "…",
  "series": { "weekdays": [1, 3], "startTime": "18:00",
              "startsOn": "2026-11-23", "until": "2026-12-31" } }
```

Правила:

- длительность сеанса = `courses.defaultDurationMin` на момент создания (CLS-8);
  `endsAt` вычисляет сервер;
- `durationMin` или `series.durationMin` в теле → `422 VALIDATION` с
  `details.fields.durationMin` (или `series.durationMin`); поле не игнорируется молча (SCH-10);
- `teacherMembershipId` необязателен: если не передан — берётся `courses.teacherMembershipId`;
  если преподавателя нет ни в теле, ни у курса → `422 VALIDATION`, `details.fields.teacherMembershipId`;
  если преподаватель пришёл из курса и не проходит проверку (неактивен, без роли) → `422 NOT_A_TEACHER`;
- явно переданный преподаватель главнее преподавателя курса и может быть заменён (CLS-7);
- для серии `class_series.duration_min` = снимок длительности курса.

`201` → `{ "created": 12, "seriesId": "…", "items": [ { "sessionId": "…", "startsAt": "…", "endsAt": "…" } ] }`
Разовый ответ: `created: 1`, `seriesId: null`.

Право: `schedule.write`.

| Код | Когда |
|---|---|
| `409 ROOM_CONFLICT` | зал занят; `details`: `conflictingSessionId`, `startsAt`, `endsAt` (ROM-5) |
| `409 TEACHER_CONFLICT` | преподаватель занят (SCH-3) |
| `422 OUTSIDE_WORKING_HOURS` | сеанс вне рабочих часов или в выходной (SCH-5) |
| `422 DATE_RANGE_TOO_LONG` | `until` позже `startsOn + 52 недели` |
| `422 ARCHIVED_COURSE` / `ARCHIVED_ROOM` | выбран архивный объект |
| `422 NOT_A_TEACHER` | у членства нет роли `teacher` (или оно неактивно) |
| `422 VALIDATION` | передан `durationMin`, нет преподавателя, прочие поля |

`422 INVALID_DURATION` больше не возвращается: длительность всегда из набора курса (45/60/75/90/120).

При серии конфликт проверяется на всех генерируемых датах, транзакция откатывается целиком.

### PATCH /studios/{studioId}/sessions/{sessionId}

`{ "roomId"?, "teacherMembershipId"?, "startsAt"? }` → `200`.

- `durationMin` → `422 VALIDATION`, `details.fields.durationMin` (SCH-10);
- `teacherMembershipId: null` → `422 VALIDATION`: у сеанса преподаватель обязателен;
- при переносе `endsAt = новое начало + собственная длительность сеанса` (бывшая разница
  `endsAt − startsAt`), а не текущая длительность курса — правка не переписывает длительность (CLS-8);
- правка одного вхождения не меняет серию.

Те же ошибки конфликтов, что у создания.

### POST /studios/{studioId}/sessions/{sessionId}/cancel

`200` → `{ "session": { "sessionId": "…", "status": "cancelled" } }` (SCH-9, приоритет Should).

### DELETE /studios/{studioId}/sessions/{sessionId}

`204` — удаляет одно вхождение.

### DELETE /studios/{studioId}/series/{seriesId}

`?futureOnly=true` (по умолчанию `true`) → `200` `{ "deleted": 8 }`.
Удаляются только будущие сеансы серии, прошедшие сохраняются (SCH-8). Право: `schedule.write`.
Несуществующая или чужая серия → `404 NOT_FOUND` (не `{ deleted: 0 }`).

## 8. Эндпоинт → право

| Эндпоинт | Право |
|---|---|
| `GET /studios/{id}` | `studio.read` |
| `GET /me` | JWT, любая роль; студийный контекст не нужен (PRF-1) |
| `PATCH /me`, `POST /me/password`, `POST/DELETE /me/avatar` | JWT, только свой аккаунт (PRF-1…PRF-12) |
| `GET /avatars/{key}` | публично, без JWT (Q17) |
| `PATCH /studios/{id}` | `studio.write` |
| `POST /studios/{id}/archive` | `studio.archive` |
| `GET /studios/{id}/members` | `members.list` (все, кроме `student`); `?role=student` — `students.write`; `PATCH/DELETE` — `members.write` |
| `GET /studios/{id}/teachers` | `schedule.read` |
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
| `TOKEN_EXPIRED` | 401 | истёк JWT; пока не возвращается — истёкший токен даёт `UNAUTHORIZED` |
| `UNAUTHORIZED` | 401 | токена нет, он невалиден или пользователь деактивирован |
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
| `NOT_A_TEACHER` | 422 | членство не в этой студии, неактивно или без роли `teacher` |
| `ARCHIVED_COURSE` | 422 | выбран курс из архива |
| `ARCHIVED_ROOM` | 422 | выбран зал из архива |
| `ALREADY_OWNER` | 422 | участник уже владелец студии |
| `INVALID_TIMEZONE` | 422 | неизвестный часовой пояс |
| `INVALID_WORKING_HOURS` | 422 | рабочие часы заданы некорректно |
| `UNKNOWN_ROLE` | 422 | роль вне набора |
| `INVALID_REFERRAL` | 422 | недопустимый код реферальной ссылки |
| `REFERRAL_TAKEN` | 409 | код занят другой студией |
| `REFERRAL_NOT_FOUND` | 404 | код не найден |
| `INTERNAL` | 500 | непредвиденная ошибка; тело без подробностей и без текста исключения |

## 10. Требует решения

**Q7 закрыт** (2026-11-22): присоединение — по реферальной ссылке студии, см.
`PATCH /studios/{id}/referral`, `GET /join/{code}`, `POST /join/{code}/register`,
`POST /join/{code}/join`.

**Q3** (участие в нескольких студиях) на контракты не влияет: студия всегда в пути запроса.
**Q8** (роль «родитель») добавит значение в `roles` и строку в матрицу прав.

**Изменения 1.1.0** (§0) реализованы в M8 (T-37…T-43), код соответствует этому документу.

**Открытые расхождения** (осознанно, вне M9): `TOKEN_EXPIRED` не возвращается — истёкший JWT даёт
`UNAUTHORIZED`; `INVALID_TIMEZONE`/`INVALID_WORKING_HOURS` отдаются при создании и правке студии,
но не при разборе часовых поясов внутри планирования.

## 11. Фаза 2 (группы, посещаемость, баланс, достижения)

Требования: groups 1.0.1, attendance 1.0.0, balance 1.0.0, achievements 1.0.0; схема — миграция 010.

- Группы: `GET/POST /studios/{id}/courses/{courseId}/groups`, `PATCH/DELETE .../groups/{groupId}`,
  `POST/DELETE .../groups/{groupId}/members`; право `courses.write`; коды 409 `GROUP_NAME_TAKEN`,
  422 `NOT_A_STUDENT`, 409 `ALREADY_IN_COURSE_GROUP`.
- Посещаемость: `GET /studios/{id}/sessions/{sessionId}/attendance`, `POST .../attendance`
  (ученик — `attended` для себя в окне [начало; +120 мин], админ — любой статус),
  `PATCH /studios/{id}/attendance/{attendanceId}`, `GET /studios/{id}/students/{membershipId}/attendance`;
  право `attendance.manage` (owner, admin); коды 409 `CHECKIN_WINDOW_CLOSED`, `ALREADY_MARKED`,
  `SESSION_CANCELLED`, `NO_LESSONS_LEFT`, 403 `NOT_IN_ROSTER`.
- Баланс: `GET .../students/{membershipId}/balance`, `GET .../balance/operations`,
  `POST .../balance/topups` (owner/admin, `balance.write`); чтение `balance.read` (owner, admin,
  curator, ученик — свой); списание/возврат — в транзакции отметки.
- Достижения: `GET/POST /studios/{id}/achievements`, `PATCH/DELETE .../achievements/{id}`,
  `POST /studios/{id}/students/{membershipId}/achievements`, `DELETE .../achievements/{awardId}`;
  право `achievements.write` (owner, admin, curator); коды 409 `ACHIEVEMENT_NAME_TAKEN`, `ALREADY_AWARDED`.
