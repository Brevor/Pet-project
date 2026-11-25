import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate, formatIsoDate, isFresh } from '../format';
import type { StudentAchievement } from '../types';
import { Badge } from '../ui/Card';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, Skeleton } from '../ui/States';

export function AchievementsTab({
  studioId,
  membershipId,
  timeZone,
  staffView = false
}: {
  studioId: string;
  membershipId: string;
  timeZone: string;
  staffView?: boolean;
}) {
  const [items, setItems] = useState<StudentAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const query = staffView ? '?includeRevoked=true' : '';
    void api<{ items: StudentAchievement[] }>(
      `/studios/${studioId}/students/${membershipId}/achievements${query}`
    )
      .then((data) => setItems(data.items))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить достижения')
      )
      .finally(() => setLoading(false));
  }, [studioId, membershipId, staffView]);

  const freshCount = items.filter(
    (item) => !item.revokedAt && isFresh(item.awardedAt)
  ).length;

  return (
    <section className="card p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Достижения</h3>
        {!loading && items.length > 0 && (
          <p className="text-xs text-faint">Всего: {items.length}</p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {staffView
          ? 'Выданные достижения ученика, включая отозванные.'
          : 'Награды студии за успехи и участие. Новые достижения отмечены значком «новое».'}
      </p>

      {error && (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Достижений пока нет"
            text={
              staffView
                ? 'Ученику ещё не выдавали достижения.'
                : 'Куратор студии сможет выдать награду — она появится в этом списке.'
            }
          />
        </div>
      ) : (
        <>
          {!staffView && freshCount > 0 && (
            <div className="mt-3">
              <InlineAlert variant="success">
                Новых достижений: {freshCount}. Загляните в список ниже.
              </InlineAlert>
            </div>
          )}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.awardId} className="rounded-md border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">{item.name}</h4>
                  {item.revokedAt ? (
                    <Badge tone="neutral">отозвано</Badge>
                  ) : (
                    isFresh(item.awardedAt) && <Badge tone="brand">новое</Badge>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                )}
                <p className="mt-2 text-xs text-faint">
                  Выдано {formatDate(item.awardedAt, timeZone)}
                  {item.eventDate ? ` · событие ${formatIsoDate(item.eventDate)}` : ''}
                  {item.revokedAt ? ` · отозвано ${formatDate(item.revokedAt, timeZone)}` : ''}
                </p>
                {item.comment && <p className="mt-1 text-xs text-faint">«{item.comment}»</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}