# HANDOFF: M16 — точка остановки после T-91

> 2026-11-25 · Coder → следующая сессия

## Сделано
- **T-91 закрыт**: `server/src/modules/achievements/{routes,repository}.ts` — каталог
  (`GET/POST /studios/{id}/achievements`, `PATCH/DELETE .../{id}`), выдача/отзыв
  (`GET/POST /studios/{id}/students/{membershipId}/achievements`,
  `DELETE .../achievements/{awardId}`); права `achievements.write` (owner/admin/curator),
  чтение каталога — `members.list`; предустановленный каталог (3 достижения) заводится в транзакции
  создания студии (`insertPresetAchievements`); удаление выданного достижения — 409
  `ACHIEVEMENT_IN_USE` (архивировать вместо удаления); отзыв сохраняет комментарий в поле `comment`.
  Тесты `server/test/achievements.test.ts` (2 теста). `tsc` 0/0, eslint 0, наборы 80/80.

## Следующая задача — T-92 (UI ученика)
Файлы: `client/src/pages/Student*`, `client/src/App.tsx`, `client/src/StudioPage.tsx`,
`client/src/types.ts`, `client/src/api.ts`.
Ключевое: вкладки «Посещения» (история из `GET .../students/{membershipId}/attendance`), «Достижения»
(`GET .../students/{membershipId}/achievements`), остаток занятий и история операций
(`GET .../balance`, `.../balance/operations`); кнопка самоотметки на ближайшем сеансе
(`POST .../sessions/{sessionId}/attendance`, ошибки по кодам `CHECKIN_WINDOW_CLOSED`, `ALREADY_MARKED`,
`NO_LESSONS_LEFT`, `NOT_IN_ROSTER`); уведомление о новом достижении (бейдж/«новинка» по `awardedAt`).
Требования ATT-2, ATT-9, BAL-6, ACH-6/9; дизайн — существующие `ui/`-примитивы и токены.
Проверки: `pnpm typecheck`, `pnpm lint`, `pnpm -C client build`.

## Правила
Одна задача за шаг, проверки (`tsc` 0/0, eslint 0, наборы) до коммита, подтверждение перед следующей.