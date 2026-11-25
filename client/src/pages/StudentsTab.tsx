import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Member } from '../types';
import { Avatar } from '../components/Avatar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Card';
import { Field } from '../ui/Field';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';

export function StudentsTab({
  studioId,
  canExclude
}: {
  studioId: string;
  canExclude: boolean;
}) {
  const [students, setStudents] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api<{ items: Member[] }>(`/studios/${studioId}/members?role=student`);
    setStudents(data.items.filter((student) => student.roles.every((role) => role === 'student')));
  }, [studioId]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить учеников')
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function addStudent(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setTemporaryPassword('');
    try {
      const result = await api<{ temporaryPassword?: string }>(`/studios/${studioId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, roles: ['student'] })
      });
      setEmail('');
      if (result.temporaryPassword) {
        setTemporaryPassword(result.temporaryPassword);
      }
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0) {
        setFieldErrors(cause.fieldErrors);
      } else {
        setError(cause instanceof Error ? cause.message : 'Не удалось добавить ученика');
      }
    }
  }

  async function removeStudent(student: Member) {
    if (!confirm(`Исключить ${student.email} из студии?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/members/${student.membershipId}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось исключить ученика');
    }
  }

  return (
    <section className="card p-4 md:p-6">
      <h3 className="text-base font-semibold">Ученики</h3>

      <form onSubmit={addStudent} className="mt-4 flex flex-wrap items-end gap-3 rounded-md bg-subtle p-4">
        <div className="min-w-[240px] flex-1">
          <Field id="student-email" label="Email ученика" error={fieldErrors.email}>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                placeholder="student@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit">Добавить ученика</Button>
      </form>

      <p className="mt-3 text-xs text-faint">
        Роль всегда «ученик». Если аккаунта нет, он создаётся, а временный пароль показывается один
        раз — передайте его ученику лично.
      </p>

      {temporaryPassword && (
        <div className="mt-3">
          <InlineAlert variant="warning">
            Временный пароль: <span className="font-mono font-semibold">{temporaryPassword}</span>
          </InlineAlert>
        </div>
      )}

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
            text="Добавьте первого ученика по email — ему будет создан аккаунт."
          />
        </div>
      ) : (
        <Table caption="Ученики студии" className="mt-4">
          <thead>
            <tr>
              <th className="table-th" scope="col">
                Ученик
              </th>
              <th className="table-th" scope="col">
                Статус
              </th>
              {canExclude && (
                <th className="table-th" scope="col">
                  <span className="sr-only">Действия</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.membershipId} className="border-t border-line">
                <td className="table-td">
                  <div className="flex items-center gap-2">
                    <Avatar url={student.avatarUrl} name={student.displayName ?? student.email ?? '?'} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">
                        {student.displayName ?? student.email}
                      </div>
                      <div className="truncate text-xs text-faint">{student.email}</div>
                    </div>
                  </div>
                </td>
                <td className="table-td">
                  <Badge tone={student.status === 'active' ? 'success' : 'neutral'}>
                    {student.status}
                  </Badge>
                </td>
                {canExclude && (
                  <td className="table-td text-right">
                    <Button size="sm" variant="danger" onClick={() => void removeStudent(student)}>
                      Исключить
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}