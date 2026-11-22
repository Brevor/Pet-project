import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Member } from '../types';

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

  const load = useCallback(async () => {
    const data = await api<{ items: Member[] }>(`/studios/${studioId}/members?role=student`);
    setStudents(data.items);
  }, [studioId]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить учеников')
    );
  }, [load]);

  async function addStudent(event: React.FormEvent) {
    event.preventDefault();
    setError('');
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
      setError(cause instanceof Error ? cause.message : 'Не удалось добавить ученика');
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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-base font-semibold">Ученики</h3>

      <form onSubmit={addStudent} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4">
        <label className="min-w-[240px] flex-1 text-sm">
          <span className="block text-slate-600">Email ученика</span>
          <input
            type="email"
            required
            placeholder="student@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Добавить ученика
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Роль всегда «ученик». Если аккаунта нет, он создаётся, а временный пароль показывается один
        раз — передайте его ученику лично.
      </p>

      {temporaryPassword && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Временный пароль: <span className="font-mono font-semibold">{temporaryPassword}</span>
        </p>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Ученик</th>
            <th className="py-2">Статус</th>
            {canExclude && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.membershipId} className="border-t border-slate-100">
              <td className="py-2">
                <div className="font-medium">{student.displayName ?? student.email}</div>
                <div className="text-xs text-slate-500">{student.email}</div>
              </td>
              <td className="py-2 text-slate-600">{student.status}</td>
              {canExclude && (
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeStudent(student)}
                    className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    Исключить
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {students.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Учеников пока нет
        </p>
      )}
    </section>
  );
}
