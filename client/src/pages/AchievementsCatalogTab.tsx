import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate, formatIsoDate } from '../format';
import type { AchievementCatalogItem, Member, StudentAchievement } from '../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Card';
import { Field } from '../ui/Field';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';

export function AchievementsCatalogTab({
  studioId,
  timeZone
}: {
  studioId: string;
  timeZone: string;
}) {
  const [items, setItems] = useState<AchievementCatalogItem[]>([]);
  const [students, setStudents] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');

  const [awardAchievementId, setAwardAchievementId] = useState('');
  const [awardMembershipId, setAwardMembershipId] = useState('');
  const [awardComment, setAwardComment] = useState('');

  const [awardsFor, setAwardsFor] = useState('');
  const [awards, setAwards] = useState<StudentAchievement[]>([]);
  const [revokeFor, setRevokeFor] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const load = useCallback(async () => {
    const [catalog, members] = await Promise.all([
      api<{ items: AchievementCatalogItem[] }>(
        `/studios/${studioId}/achievements?includeArchived=${showArchived ? 'true' : 'false'}`
      ),
      api<{ items: Member[] }>(`/studios/${studioId}/members?role=student`)
    ]);
    setItems(catalog.items);
    const list = members.items.filter((item) => item.roles.includes('student'));
    setStudents(list);
    setAwardMembershipId((current) => current || (list[0]?.membershipId ?? ''));
    setAwardsFor((current) => current || (list[0]?.membershipId ?? ''));
    setAwardAchievementId(
      (current) => current || (catalog.items.find((item) => !item.archived)?.achievementId ?? '')
    );
  }, [studioId, showArchived]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить достижения')
      )
      .finally(() => setLoading(false));
  }, [load]);

  const loadAwards = useCallback(async () => {
    if (!awardsFor) {
      setAwards([]);
      return;
    }
    const data = await api<{ items: StudentAchievement[] }>(
      `/studios/${studioId}/students/${awardsFor}/achievements?includeRevoked=true`
    );
    setAwards(data.items);
  }, [studioId, awardsFor]);

  useEffect(() => {
    void loadAwards().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить выдачи')
    );
  }, [loadAwards]);

  async function createAchievement(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api(`/studios/${studioId}/achievements`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          eventDate: eventDate || undefined
        })
      });
      setName('');
      setDescription('');
      setEventDate('');
      setNotice('Достижение добавлено в каталог');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать достижение');
    }
  }

  async function toggleArchive(item: AchievementCatalogItem) {
    setError('');
    try {
      await api(`/studios/${studioId}/achievements/${item.achievementId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !item.archived })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить достижение');
    }
  }

  async function removeAchievement(item: AchievementCatalogItem) {
    if (!confirm(`Удалить достижение «${item.name}»?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/achievements/${item.achievementId}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить достижение');
    }
  }

  async function award(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api(`/studios/${studioId}/students/${awardMembershipId}/achievements`, {
        method: 'POST',
        body: JSON.stringify({
          achievementId: awardAchievementId,
          comment: awardComment.trim() || undefined
        })
      });
      setAwardComment('');
      setNotice('Достижение выдано');
      await Promise.all([load(), loadAwards()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выдать достижение');
    }
  }

  async function revoke(awardId: string) {
    setError('');
    setNotice('');
    try {
      await api(`/studios/${studioId}/students/${awardsFor}/achievements/${awardId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: revokeReason.trim() || undefined })
      });
      setRevokeFor(null);
      setRevokeReason('');
      setNotice('Достижение отозвано');
      await Promise.all([load(), loadAwards()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отозвать достижение');
    }
  }

  const activeItems = items.filter((item) => !item.archived);

  return (
    <section className="space-y-4">
      <section className="card p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">Каталог достижений</h3>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Показывать архив
          </label>
        </div>
        <p className="mt-1 text-sm text-muted">
          Базовые достижения создаются вместе со студией. Архивное достижение нельзя выдать, но
          ранее выданные остаются у учеников.
        </p>

        {error && (
          <div className="mt-3">
            <InlineAlert variant="error">{error}</InlineAlert>
          </div>
        )}
        {notice && (
          <div className="mt-3">
            <InlineAlert variant="success">{notice}</InlineAlert>
          </div>
        )}

        <form onSubmit={createAchievement} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Field id="achievement-name" label="Название" required>
              {(props) => (
                <input
                  {...props}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  placeholder="Первый выход на сцену"
                />
              )}
            </Field>
          </div>
          <div className="min-w-[220px] flex-1">
            <Field id="achievement-description" label="Описание">
              {(props) => (
                <input
                  {...props}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={300}
                />
              )}
            </Field>
          </div>
          <label className="text-sm">
            <span className="label">Дата события</span>
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="input"
            />
          </label>
          <Button type="submit" disabled={name.trim().length < 2}>
            Добавить
          </Button>
        </form>

        {loading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Каталог пуст" text="Добавьте первое достижение." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table caption="Каталог достижений студии">
              <thead>
                <tr>
                  <th className="table-th" scope="col">
                    Достижение
                  </th>
                  <th className="table-th" scope="col">
                    Событие
                  </th>
                  <th className="table-th" scope="col">
                    Выдано
                  </th>
                  <th className="table-th" scope="col">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.achievementId} className="border-t border-line">
                    <td className="table-td">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{item.name}</span>
                        {item.archived && <Badge tone="warning">архив</Badge>}
                      </div>
                      {item.description && (
                        <div className="text-xs text-faint">{item.description}</div>
                      )}
                    </td>
                    <td className="table-td whitespace-nowrap">
                      {item.eventDate ? formatIsoDate(item.eventDate) : '—'}
                    </td>
                    <td className="table-td tabular-nums">{item.awardedCount}</td>
                    <td className="table-td text-right">
                      <button
                        type="button"
                        onClick={() => void toggleArchive(item)}
                        className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-subtle"
                      >
                        {item.archived ? 'Вернуть' : 'В архив'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAchievement(item)}
                        className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-soft"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      <section className="card p-4 md:p-6">
        <h3 className="text-base font-semibold">Выдать достижение</h3>
        <p className="mt-1 text-sm text-muted">
          Одно и то же достижение выдаётся ученику один раз; повторная выдача вернёт ошибку.
        </p>
        <form onSubmit={award} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="label">Ученик</span>
            <select
              value={awardMembershipId}
              onChange={(event) => setAwardMembershipId(event.target.value)}
              className="input"
            >
              {students.map((student) => (
                <option key={student.membershipId} value={student.membershipId}>
                  {student.displayName ?? student.email ?? student.membershipId}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Достижение</span>
            <select
              value={awardAchievementId}
              onChange={(event) => setAwardAchievementId(event.target.value)}
              className="input"
            >
              {activeItems.map((item) => (
                <option key={item.achievementId} value={item.achievementId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Комментарий</span>
            <input
              value={awardComment}
              onChange={(event) => setAwardComment(event.target.value)}
              maxLength={300}
              className="input"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={!awardMembershipId || !awardAchievementId}>
              Выдать
            </Button>
          </div>
        </form>
      </section>

      <section className="card p-4 md:p-6">
        <h3 className="text-base font-semibold">Выданные достижения</h3>
        <div className="mt-3 max-w-sm">
          <label className="text-sm">
            <span className="label">Ученик</span>
            <select
              value={awardsFor}
              onChange={(event) => {
                setAwardsFor(event.target.value);
                setRevokeFor(null);
              }}
              className="input"
            >
              {students.map((student) => (
                <option key={student.membershipId} value={student.membershipId}>
                  {student.displayName ?? student.email ?? student.membershipId}
                </option>
              ))}
            </select>
          </label>
        </div>

        {awards.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Выдач пока нет.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {awards.map((item) => (
              <li key={item.awardId} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{item.name}</span>
                      {item.revokedAt && <Badge tone="neutral">отозвано</Badge>}
                    </div>
                    <p className="text-xs text-faint">
                      Выдано {formatDate(item.awardedAt, timeZone)}
                      {item.comment ? ` · «${item.comment}»` : ''}
                    </p>
                  </div>
                  {!item.revokedAt && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setRevokeFor(item.awardId);
                        setRevokeReason('');
                      }}
                    >
                      Отозвать
                    </Button>
                  )}
                </div>

                {revokeFor === item.awardId && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-[200px] flex-1 text-sm">
                      <span className="label">Причина отзыва (необязательно)</span>
                      <input
                        value={revokeReason}
                        onChange={(event) => setRevokeReason(event.target.value)}
                        maxLength={300}
                        className="input"
                      />
                    </label>
                    <Button size="sm" variant="danger" onClick={() => void revoke(item.awardId)}>
                      Подтвердить отзыв
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRevokeFor(null)}>
                      Отмена
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
