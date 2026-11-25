import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime } from '../format';
import { ATTENDANCE_STATUS_LABELS, type AttendanceRecord } from '../types';
import { Badge } from '../ui/Card';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';

const PAGE_SIZE = 20;

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'attended') return 'success';
  if (status === 'no_show') return 'warning';
  return 'neutral';
}

export function AttendanceTab({
  studioId,
  membershipId,
  timeZone
}: {
  studioId: string;
  membershipId: string;
  timeZone: string;
}) {
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      const params = new URLSearchParams({
        page: String(nextPage),
        perPage: String(PAGE_SIZE)
      });
      const data = await api<{ items: AttendanceRecord[]; total: number }>(
        `/studios/${studioId}/students/${membershipId}/attendance?${params.toString()}`
      );
      setItems((previous) => (append ? [...previous, ...data.items] : data.items));
      setTotal(data.total);
      setPage(nextPage);
    },
    [studioId, membershipId]
  );

  useEffect(() => {
    setLoading(true);
    setError('');
    void load(1, false)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить посещения')
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      await load(page + 1, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить посещения');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="card p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Посещения</h3>
        {!loading && <p className="text-xs text-faint">Всего записей: {total}</p>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Отметка «пришёл» списывает одно занятие с баланса. Отменить участие можно до начала занятия.
      </p>

      {error && (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      {loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Посещений пока нет"
            text="Отметьтесь на занятии в расписании — оно появится здесь."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table caption="История посещений ученика">
              <thead>
                <tr>
                  <th className="table-th" scope="col">
                    Когда
                  </th>
                  <th className="table-th" scope="col">
                    Курс
                  </th>
                  <th className="table-th" scope="col">
                    Зал
                  </th>
                  <th className="table-th" scope="col">
                    Преподаватель
                  </th>
                  <th className="table-th" scope="col">
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.attendanceId} className="border-t border-line">
                    <td className="table-td whitespace-nowrap">
                      {formatDateTime(item.startsAt, timeZone)}
                    </td>
                    <td className="table-td font-medium text-ink">{item.courseName}</td>
                    <td className="table-td">{item.roomName}</td>
                    <td className="table-td">{item.teacherName}</td>
                    <td className="table-td">
                      <Badge tone={statusTone(item.status)}>
                        {ATTENDANCE_STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {items.length < total && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
