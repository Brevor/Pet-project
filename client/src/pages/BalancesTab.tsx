import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { pluralLessons } from '../format';
import type { Member } from '../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Card';
import { Field } from '../ui/Field';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';
import { BalanceTab } from './BalanceTab';

export function BalancesTab({
  studioId,
  canManage,
  timeZone
}: {
  studioId: string;
  canManage: boolean;
  timeZone: string;
}) {
  const [students, setStudents] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [studentId, setStudentId] = useState('');
  const [lessons, setLessons] = useState('10');
  const [comment, setComment] = useState('');
  const [months, setMonths] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const list = await api<{ items: Member[] }>(`/studios/${studioId}/members?role=student`);
    const studentList = list.items.filter((item) => item.roles.includes('student'));
    const pairs = await Promise.all(
      studentList.map(async (student) => {
        const data = await api<{ balance: number }>(
          `/studios/${studioId}/students/${student.membershipId}/balance`
        );
        return [student.membershipId, data.balance] as const;
      })
    );
    setStudents(studentList);
    setBalances(Object.fromEntries(pairs));
    setStudentId((current) => current || (studentList[0]?.membershipId ?? ''));
  }, [studioId]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить балансы')
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function topUp(event: React.FormEvent) {
    event.preventDefault();
    if (!studentId) return;
    setSaving(true);
    setError('');
    setNotice('');
    setFieldError({});
    try {
      const data = await api<{ balance: number }>(
        `/studios/${studioId}/students/${studentId}/balance/topups`,
        {
          method: 'POST',
          body: JSON.stringify({
            lessons: Number(lessons),
            comment: comment.trim() || undefined,
            expiresInMonths: months ? Number(months) : undefined
          })
        }
      );
      setNotice(`Начислено. Новый остаток: ${data.balance} ${pluralLessons(data.balance)}`);
      setComment('');
      await load();
      setVersion((current) => current + 1);
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0) {
        setFieldError(cause.fieldErrors);
      } else {
        setError(cause instanceof Error ? cause.message : 'Не удалось начислить занятия');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <section className="card p-4 md:p-6">
        <h3 className="text-base font-semibold">Балансы учеников</h3>
        <p className="mt-1 text-sm text-muted">
          Остаток — неиспользованные занятия неистёкших пакетов. Начисление выполняют владелец или
          администратор.
        </p>

        {error && (
          <div className="mt-3">
            <InlineAlert variant="error">{error}</InlineAlert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : students.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Учеников пока нет"
              text="Добавьте учеников на вкладке «Ученики», затем начисляйте им пакеты."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table caption="Балансы учеников студии">
              <thead>
                <tr>
                  <th className="table-th" scope="col">
                    Ученик
                  </th>
                  <th className="table-th" scope="col">
                    Остаток
                  </th>
                  <th className="table-th" scope="col">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const balance = balances[student.membershipId] ?? 0;
                  return (
                    <tr key={student.membershipId} className="border-t border-line">
                      <td className="table-td font-medium text-ink">
                        {student.displayName ?? student.email ?? student.membershipId}
                      </td>
                      <td className="table-td">
                        <Badge tone={balance > 0 ? 'success' : 'warning'}>
                          {balance} {pluralLessons(balance)}
                        </Badge>
                      </td>
                      <td className="table-td text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setSelected(
                              selected === student.membershipId ? null : student.membershipId
                            )
                          }
                          aria-expanded={selected === student.membershipId}
                        >
                          {selected === student.membershipId ? 'Скрыть' : 'История'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      {canManage && (
        <form onSubmit={topUp} className="card p-4 md:p-6">
          <h3 className="text-base font-semibold">Начислить пакет</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="label">Ученик</span>
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="input"
              >
                {students.map((student) => (
                  <option key={student.membershipId} value={student.membershipId}>
                    {student.displayName ?? student.email ?? student.membershipId}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Field id="topup-lessons" label="Занятий" error={fieldError.lessons}>
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    min={1}
                    max={999}
                    value={lessons}
                    onChange={(event) => setLessons(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <label className="text-sm">
              <span className="label">Срок действия</span>
              <select
                value={months}
                onChange={(event) => setMonths(event.target.value)}
                className="input"
              >
                <option value="">без срока</option>
                <option value="1">1 месяц</option>
                <option value="3">3 месяца</option>
                <option value="6">6 месяцев</option>
                <option value="12">12 месяцев</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="label">Комментарий</span>
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={300}
                placeholder="ноябрь"
                className="input"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !studentId}>
              {saving ? 'Начисляем…' : 'Начислить'}
            </Button>
            {notice && <span className="text-sm text-success">{notice}</span>}
          </div>
        </form>
      )}

      {selected && (
        <BalanceTab
          key={`${selected}-${version}`}
          studioId={studioId}
          membershipId={selected}
          timeZone={timeZone}
        />
      )}
    </section>
  );
}
