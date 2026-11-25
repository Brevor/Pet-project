import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime, formatIsoDate, pluralLessons } from '../format';
import { BALANCE_KIND_LABELS, type BalanceOperation } from '../types';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, Skeleton, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';

const PAGE_SIZE = 20;

export function BalanceTab({
  studioId,
  membershipId,
  timeZone
}: {
  studioId: string;
  membershipId: string;
  timeZone: string;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<BalanceOperation[]>([]);
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
      const [balanceData, operations] = await Promise.all([
        api<{ balance: number }>(`/studios/${studioId}/students/${membershipId}/balance`),
        api<{ items: BalanceOperation[]; total: number }>(
          `/studios/${studioId}/students/${membershipId}/balance/operations?${params.toString()}`
        )
      ]);
      setBalance(balanceData.balance);
      setItems((previous) => (append ? [...previous, ...operations.items] : operations.items));
      setTotal(operations.total);
      setPage(nextPage);
    },
    [studioId, membershipId]
  );

  useEffect(() => {
    setLoading(true);
    setError('');
    void load(1, false)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить баланс')
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    setError('');
    try {
      await load(page + 1, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить баланс');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="card p-4 md:p-6">
      <h3 className="text-base font-semibold">Баланс занятий</h3>

      {error && (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      <div className="mt-4 rounded-md bg-subtle p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Остаток</p>
        {loading || balance === null ? (
          <Skeleton className="mt-2 h-9 w-24" />
        ) : (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-3xl font-semibold text-ink">{balance}</span>
            <span className="text-sm text-muted">{pluralLessons(balance)}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-faint">
          Одно занятие списывается при отметке «пришёл». Просроченные занятия не учитываются.
        </p>
      </div>

      <h4 className="mt-5 text-sm font-semibold">История операций</h4>

      {loading ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Операций пока нет"
            text="Начисления пакетов и списания за посещения появятся здесь."
          />
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <Table caption="История операций по балансу">
              <thead>
                <tr>
                  <th className="table-th" scope="col">
                    Когда
                  </th>
                  <th className="table-th" scope="col">
                    Операция
                  </th>
                  <th className="table-th" scope="col">
                    Занятия
                  </th>
                  <th className="table-th" scope="col">
                    Комментарий
                  </th>
                  <th className="table-th" scope="col">
                    Действует до
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.operationId} className="border-t border-line">
                    <td className="table-td whitespace-nowrap">
                      {formatDateTime(item.createdAt, timeZone)}
                    </td>
                    <td className="table-td">{BALANCE_KIND_LABELS[item.kind] ?? item.kind}</td>
                    <td
                      className={`table-td tabular-nums font-semibold ${
                        item.lessons > 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {item.lessons > 0 ? `+${item.lessons}` : item.lessons}
                    </td>
                    <td className="table-td">{item.comment ?? '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      {item.expiresOn ? formatIsoDate(item.expiresOn) : '—'}
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
