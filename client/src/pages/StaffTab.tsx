import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ROLE_LABELS, type Member } from '../types';

const ALL_ROLES = Object.keys(ROLE_LABELS);

export function StaffTab({ studioId }: { studioId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['teacher']);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await api<{ items: Member[] }>(`/studios/${studioId}/members`);
    setMembers(data.items);
  }, [studioId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setTempPassword('');
    try {
      const result = await api<{ temporaryPassword?: string }>(`/studios/${studioId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, roles })
      });
      setEmail('');
      if (result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось добавить участника');
    }
  }

  async function removeMember(membershipId: string, memberEmail: string) {
    if (!confirm(`Исключить ${memberEmail} из студии?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/members/${membershipId}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось исключить участника');
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-base font-semibold">Персонал</h3>

      <form onSubmit={addMember} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="email"
            required
            placeholder="email участника"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Добавить
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
                className="rounded border-slate-300"
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Приглашений нет: аккаунт должен существовать. Для роли «Ученик» аккаунт создаётся
          автоматически, временный пароль показывается один раз.
        </p>
      </form>

      {tempPassword && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Временный пароль: <span className="font-mono font-semibold">{tempPassword}</span> — передайте
          ученику лично.
        </p>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Участник</th>
            <th className="py-2">Роли</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.membershipId} className="border-t border-slate-100">
              <td className="py-2">
                <div className="font-medium">{member.displayName ?? member.email}</div>
                <div className="text-xs text-slate-500">{member.email}</div>
              </td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {member.roles.map((role) => (
                    <span
                      key={role}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 text-right">
                {!member.roles.includes('owner') && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.membershipId, member.email)}
                    className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    Исключить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
