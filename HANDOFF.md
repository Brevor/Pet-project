# HANDOFF: M16 — точка остановки после T-90

> 2026-11-25 · Coder → следующая сессия

## Сделано
- **T-90 закрыт**: `server/src/modules/balance/{routes,repository}.ts` — `GET .../balance`,
  `GET .../balance/operations`, `POST .../balance/topups`; права `balance.read` (owner/admin/curator,
  ученик — свой) и `balance.write` (owner/admin) в `rbac.ts`, регистрация в `app.ts`.
  Списание 1 занятия и возврат встроены в транзакции `attendance/repository.ts`
  (`chargeAttendanceLesson` / `refundAttendanceLesson`), 0 — 409 `NO_LESSONS_LEFT` с откатом отметки.
  Остаток — хронологический учёт пакетов: списание расходует только пакеты, действовавшие в момент
  списания; просроченные занятия исчезают из остатка (BAL-9).
- Тесты: `server/test/balance.test.ts` (начисление/история/права, списание/возврат/идемпотентность,
  срок действия и порядок списания); в `attendance.test.ts` фикстуры с начислением. `tsc` 0/0,
  eslint 0, наборы 78/78.

## Следующая задача — T-91 (достижения)
Файлы: `server/src/modules/achievements/{routes,repository}.ts`, сид предустановленного каталога при
создании студии (`studios/repository.ts`), право `achievements.write` в `rbac.ts`, регистрация в `app.ts`.
Ключевое: каталог `GET/POST /studios/{id}/achievements`, `PATCH/DELETE .../achievements/{id}`;
выдача/отзыв `POST /studios/{id}/students/{membershipId}/achievements`,
`DELETE .../achievements/{awardId}`; коды 409 `ACHIEVEMENT_NAME_TAKEN`, `ALREADY_AWARDED`;
право `achievements.write` (owner, admin, curator); предустановленный каталог при `POST /studios`;
одно не отозванное достижение на пару (achievement, membership) — уникальный индекс уже есть.
Тесты: `server/test/achievements.test.ts` по образцу `balance.test.ts`.

## Правила
Одна задача за шаг, проверки (`tsc` 0/0, eslint 0, наборы) до коммита, подтверждение перед следующей.