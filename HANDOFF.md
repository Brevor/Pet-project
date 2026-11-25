# HANDOFF: M16 — точка остановки после T-92

> 2026-11-25 · Coder → следующая сессия

## Сделано
- **T-92 закрыт** (UI ученика): вкладки «Посещения» (`AttendanceTab`), «Баланс» (`BalanceTab`),
  «Достижения» (`AchievementsTab`) в `StudioPage` — видны при роли `student`; `membershipId` берётся
  из `GET /studios`; самоотметка «Я пришёл» / отмена «Не смогу прийти» — в поповере сеанса
  `ScheduleTab` (окно считается по `startsAt`, ошибки API маппятся по кодам); баннер «Новое
  достижение» по `awardedAt` за 7 дней; `client/src/format.ts` — даты/склонение.
  Проверки: `tsc` 0/0, eslint 0, `vite build` ок (запуск `node ../node_modules/vite/bin/vite.js build`
  — `pnpm -C client build` в этом окружении падает из-за битого `.bin`, сами зависимости в корне есть).

## Следующая задача — T-93 (UI админа)
Файлы: `client/src/pages/ScheduleTab.tsx` (ростер и отметки в поповере), `CoursesTab.tsx` (группы
курса), новый `BalancesTab.tsx` и `AchievementsTab` (каталог) для staff, `StudentsTab.tsx` (карточка
ученика: посещения, достижения, баланс, выдача/отзыв, начисление), `types.ts`, `StudioPage.tsx`.
Ключевое: админ ставит/правит отметки (ростер = ученики групп курса, `GET/POST .../attendance`,
`PATCH .../attendance/{id}`), группы в курсе (`/courses/{courseId}/groups`), начисление пакета
(`POST .../balance/topups`), каталог и выдача достижений (`/achievements`, `/students/{id}/achievements`).
Требования ATT-6, BAL-2, GRP-1, ACH-1; использовать существующие `ui/`-примитивы и токены.
Проверки: `pnpm typecheck`, `pnpm lint`, `pnpm -C client build` (или прямой vite build).

## Правила
Одна задача за шаг, проверки (`tsc` 0/0, eslint 0, наборы) до коммита, подтверждение перед следующей.