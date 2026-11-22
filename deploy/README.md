# Локальный деплой (Docker Compose)

Postgres, API и статика клиента поднимаются в трёх контейнерах. Вход — `http://localhost:8080`.

## Что нужно

1. **Docker Desktop запущен** (служба `com.docker.service` должна быть Running).
2. Свободный порт **8080**.
3. Три переменные в `.env` (файл уже есть в корне репозитория) — см. `.env.compose.example`:

```
POSTGRES_USER=studio
POSTGRES_PASSWORD=studio
POSTGRES_DB=studioflow
```

Локальный `.env` с `DATABASE_URL` продолжает работать для разработки: compose подменяет
подключение своим — `postgres://…@db:5432/…` внутри сети контейнеров.

## Запуск

```bash
docker compose up -d --build
```

Проверка:

```bash
docker compose ps
curl http://localhost:8080/health
```

Ожидаемо: `{"status":"ok"}` и страница «Каркас клиента готов» на `http://localhost:8080`.

## API

База — `/api/v1`. Авторизация: `Authorization: Bearer <token>`.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | живость сервиса, без авторизации |
| POST | `/api/v1/auth/register` | регистрация: `email`, `password` (≥ 8), `displayName?` |
| POST | `/api/v1/auth/login` | вход, возвращает JWT |
| GET | `/api/v1/me` | профиль и членства с ролями |
| GET | `/api/v1/studios` | студии, где я участник |
| POST | `/api/v1/studios` | создание студии: `name`, `timezone`, `workingHours?` |
| GET | `/api/v1/studios/{id}` | студия, часы, мои роли |
| PATCH | `/api/v1/studios/{id}` | название, часовой пояс, часы |
| POST | `/api/v1/studios/{id}/archive` | архивация, только владелец |
| GET | `/api/v1/studios/{id}/members` | участники, фильтры `role`, `q` |
| POST | `/api/v1/studios/{id}/members` | добавить по `email` с ролями |
| PATCH | `/api/v1/studios/{id}/members/{membershipId}` | заменить набор ролей |
| DELETE | `/api/v1/studios/{id}/members/{membershipId}` | исключить участника |
| POST | `/api/v1/studios/{id}/owner-transfer` | передать владение |
| GET/POST | `/api/v1/studios/{id}/rooms` | залы: список и создание |
| PATCH/DELETE | `/api/v1/studios/{id}/rooms/{roomId}` | правка, архивация, удаление |
| GET/POST | `/api/v1/studios/{id}/courses` | курсы: список и создание |
| PATCH/DELETE | `/api/v1/studios/{id}/courses/{courseId}` | правка, архивация, удаление |
| GET | `/api/v1/studios/{id}/schedule?from=&to=` | расписание за период |
| POST | `/api/v1/studios/{id}/sessions` | сеанс или серия (`series` в теле) |
| PATCH/DELETE | `/api/v1/studios/{id}/sessions/{sessionId}` | правка и удаление сеанса |
| POST | `/api/v1/studios/{id}/sessions/{sessionId}/cancel` | отмена сеанса |
| DELETE | `/api/v1/studios/{id}/series/{seriesId}` | удалить будущие сеансы серии |

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@studio.ru","password":"secret123","displayName":"Анна"}'
```

Ошибки — единый конверт `{"error":{"code","message","details?"}}`: `422 VALIDATION`,
`409 EMAIL_TAKEN`, `401 INVALID_CREDENTIALS`, `401 UNAUTHORIZED`.

## Что происходит при старте

1. `db` — контейнер `postgres:18-alpine`, данные в volume `pgdata`.
2. `api` ждёт healthcheck базы, затем `entrypoint.sh`:
   - `node dist/src/db/migrate.js` — накатывает миграции (идемпотентно);
   - `node dist/src/server.js` — поднимает Fastify на 3000 внутри сети.
3. `web` — Caddy: раздаёт `client/dist`, `/api/*` и `/health` проксирует на `api:3000`.

## Эксплуатация

| Действие | Команда |
|---|---|
| Логи API | `docker compose logs -f api` |
| Логи всех | `docker compose logs -f` |
| Перезапуск API | `docker compose restart api` |
| Пересборка после кода | `docker compose up -d --build` |
| Остановить | `docker compose down` |
| Снести БД (volume) | `docker compose down -v` |
| Зайти в psql | `docker compose exec db psql -U studio -d studioflow` |

## Ограничения текущего среза

- API отдаёт только `/health` — остальные маршруты появятся с M2–M5.
- Клиент — экран-заглушка; интерфейс пока живёт в `prototype/`.
- Порты БД наружу не публикуются: доступ только из сети compose.
- Секретов в образах нет: `POSTGRES_PASSWORD` приходит из `.env`.

## Если не поднимается

| Симптом | Причина / решение |
|---|---|
| `Cannot connect to the Docker daemon` | не запущен Docker Desktop |
| `port is already allocated` на 8080 | занят порт — освободить или поменять `ports` в `docker-compose.yml` |
| `db` unhealthy / `Restarting` | том должен быть смонтирован в `/var/lib/postgresql` (требование образа 18+); старый volume — `docker compose down -v` и заново |
| `api` падает на миграциях | смотреть `docker compose logs api`; частая причина — нет `btree_gist` (в образе postgres contrib есть) |
| `entrypoint.sh: not found` | сработало CRLF-преобразование; в Dockerfile есть `sed`, но проверьте `.gitattributes` |
