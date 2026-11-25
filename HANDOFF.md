# HANDOFF: M16 — точка остановки после T-89

> 2026-11-25 · Coder → следующая сессия

## Сделано
- **T-89 закрыт**: `server/src/modules/attendance/{routes,repository}.ts` (ростер, самоотметка в окне,
  отметки/правки администратора, аудит `attendance_revisions`, история ученика), регистрация в `app.ts`,
  право `attendance.manage` (owner, admin) в `rbac.ts`. Тесты `server/test/attendance.test.ts` (4 теста:
  самоотметка и история; окна/ростер/отмена; админ/аудит/права; история/пагинация/дата создания студии).
  `tsc` 0/0, eslint 0, наборы 75/75.
- `server/package.json`: `test` переведён на glob `dist/test/**/*.test.js` — Node 24 не принимает каталог
  в `node --test`.

## Следующая задача — T-90 (баланс)
Файлы: `server/src/modules/balance/{routes,repository}.ts`, правки `attendance/repository.ts`
(транзакция отметки уже открыта — вставлять списание/возврат туда).
Ключевое: остаток = сумма операций; списание 1 занятия атомарно с `attended` (409 `NO_LESSONS_LEFT` при
остатке 0 с учётом срока пакета), возврат при `attended → no_show/cancelled`, идемпотентность charge по
`(session_id, membership_id)` — уникальный индекс `lesson_balance_charge_once` уже есть; эндпоинты
`GET .../students/{membershipId}/balance`, `GET .../balance/operations`, `POST .../balance/topups`;
права `balance.read` (owner/admin/curator, ученик — свой), `balance.write` (owner/admin); срок действия
пакета (BAL-9).
Тесты: `server/test/balance.test.ts`; в `attendance.test.ts` добавить начисление в фикстуру и проверки
ATT-3/ATT-6 (при 0 — 409, при правке — возврат).

## Правила
Одна задача за шаг, проверки (`tsc` 0/0, eslint 0, наборы) до коммита, подтверждение перед следующей.