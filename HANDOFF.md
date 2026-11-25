# HANDOFF: M16 — точка остановки после T-88

> 2026-11-25 · Coder → следующая сессия

## Сделано
- **T-88 закрыт**: `server/src/modules/groups/routes.ts` (CRUD групп курса, состав, ростер),
  регистрация в `app.ts`, тесты `server/test/groups.test.ts` (1 тест, все ветки: 201, 409 dup,
  409 вторая группа, 403 teacher, 204 удаления). `tsc` 0, тест зелёный.
- Миграция 010 применена локально и в контейнере (`5e2381f`).

## Следующая задача — T-89 (посещаемость)
Файлы: `server/src/modules/attendance/{routes,repository}.ts`, `server/src/modules/balance/*`.
Ключевое: ростер = ученики групп курса (SQL из `course_group_members`); самоотметка — окно
[начало; +120 мин] в TZ студии (`zonedMinutes` из schedule), только `attended`; админ — любой
статус любому ученику студии; `PATCH` с аудитом (`attendance_revisions`); `409 CHECKIN_WINDOW_CLOSED`,
`ALREADY_MARKED`, `SESSION_CANCELLED`, `NOT_IN_ROSTER`; списание/возврат — в транзакции (T-90).
Тесты: `server/test/attendance.test.ts` по образцу `groups.test.ts` (фикстуры уже есть).

## Правила
Одна задача за шаг, проверки (`tsc` 0/0, eslint 0, наборы) до коммита, подтверждение перед следующей.