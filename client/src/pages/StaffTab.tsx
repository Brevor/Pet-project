import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ROLE_LABELS, type Member } from '../types';

interface MeResponse {
  user: { email: string };
  memberships: Array<{ studioId: string; roles: string[] }>;
}

const ALL_ROLES = Object.keys(ROLE_LABELS);

export function StaffTab({ studioId }: { studioId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['teacher']);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [list, me] = await Promise.all([
      api<{ items: Member[] }>(`/studios/${studioId}/members`),
      api<MeResponse>('/me')
    ]);
    setMembers(list.items.filter((member) => member.roles.some((role) => role !== 'student')));
    setCurrentEmail(me.user.email);
    const membership = me.memberships.find((item) => item.studioId === studioId);
    setIsOwner(membership?.roles.includes('owner') ?? false);
  }, [studioId]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить участников')
    );
  }, [load]);

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  function toggleDraftRole(role: string) {
    setDraftRoles((current) =>
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

  function startEdit(member: Member) {
    setEditingId(member.membershipId);
    setDraftRoles([...member.roles]);
    setError('');
  }

  async function saveRoles(event: React.FormEvent, membershipId: string) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/members/${membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: draftRoles })
      });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить роли');
    }
  }

  async function transferOwnership(member: Member) {
    if (!confirm(`Передать владение студией участнику ${member.email}?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/owner-transfer`, {
        method: 'POST',
        body: JSON.stringify({ membershipId: member.membershipId })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось передать владение');
    }
  }

  async function removeMember(member: Member) {
    if (!confirm(`Исключить ${member.email} из студии?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/members/${member.membershipId}`, { method: 'DELETE' });
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
          {ALL_ROLES.filter((role) => role !== 'owner').map((role) => (
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
          {members.map((member) => {
            const isSelf = member.email === currentEmail;
            const canEdit = !isSelf && !member.roles.includes('owner');
            return (
              <tr key={member.membershipId} className="border-t border-slate-100">
                <td className="py-2">
                  <div className="font-medium">
                    {member.displayName ?? member.email}
                    {isSelf && <span className="ml-2 text-xs text-slate-400">(вы)</span>}
                  </div>
                  <div className="text-xs text-slate-500">{member.email}</div>
                </td>
                <td className="py-2">
                  {editingId === member.membershipId ? (
                    <form
                      onSubmit={(event) => saveRoles(event, member.membershipId)}
                      className="flex flex-wrap gap-2"
                    >
                      {ALL_ROLES.filter((role) => role !== 'owner').map((role) => (
                        <label key={role} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={draftRoles.includes(role)}
                            onChange={() => toggleDraftRole(role)}
                          />
                          {ROLE_LABELS[role]}
                        </label>
                      ))}
                      <button
                        type="submit"
                        className="rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                      >
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <span
                          key={role}
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            role === 'owner'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ROLE_LABELS[role] ?? role}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {canEdit && editingId !== member.membershipId && (
                      <button
                        type="button"
                        onClick={() => startEdit(member)}
                        className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        Изменить роли
                      </button>
                    )}
                    {isOwner && !member.roles.includes('owner') && (
                      <button
                        type="button"
                        onClick={() => transferOwnership(member)}
                        className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      >
                        Передать владение
                      </button>
                    )}
                    {canEdit && !member.roles.includes('owner') && (
                      <button
                        type="button"
                        onClick={() => removeMember(member)}
                        className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        Исключить
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
