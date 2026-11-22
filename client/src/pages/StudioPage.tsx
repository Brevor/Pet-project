import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  curator: 'Куратор',
  teacher: 'Преподаватель',
  assistant: 'Ассистент',
  student: 'Ученик'
};

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface Membership {
  studioId: string;
  studioName: string;
  roles: string[];
  status: string;
}

interface WorkingHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface StudioView {
  studio: { id: string; name: string; timezone: string };
  workingHours: WorkingHour[];
  myRoles: string[];
}

interface Member {
  membershipId: string;
  email: string;
  displayName: string | null;
  roles: string[];
  status: string;
}

function describeHours(hours: WorkingHour[]): string {
  const open = hours.filter((hour) => !hour.isClosed);
  if (open.length === 0) return 'Студия закрыта';
  const first = open[0]!;
  const closedDays = hours.filter((hour) => hour.isClosed).map((hour) => DAYS[hour.weekday - 1]);
  const base = `${first.opensAt}–${first.closesAt}`;
  return closedDays.length > 0 ? `${base}, выходной: ${closedDays.join(', ')}` : base;
}

export function StudioPage({ onLogout }: { onLogout: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studio, setStudio] = useState<StudioView | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [creating, setCreating] = useState(false);

  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['teacher']);
  const [tempPassword, setTempPassword] = useState('');

  const loadMembers = useCallback(async (studioId: string) => {
    const data = await api<{ items: Member[] }>(`/studios/${studioId}/members`);
    setMembers(data.items);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api<{ items: Membership[] }>('/studios');
      const first = list.items[0];
      if (!first) {
        setStudio(null);
        return;
      }
      const view = await api<StudioView>(`/studios/${first.studioId}`);
      setStudio(view);
      await loadMembers(first.studioId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [loadMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStudio(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api('/studios', { method: 'POST', body: JSON.stringify({ name, timezone }) });
      setName('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать студию');
    } finally {
      setCreating(false);
    }
  }

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!studio) return;
    setError('');
    setTempPassword('');
    try {
      const result = await api<{ temporaryPassword?: string }>(
        `/studios/${studio.studio.id}/members`,
        { method: 'POST', body: JSON.stringify({ email, roles }) }
      );
      setEmail('');
      if (result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
      }
      await loadMembers(studio.studio.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось добавить участника');
    }
  }

  async function removeMember(membershipId: string, memberEmail: string) {
    if (!studio) return;
    if (!confirm(`Исключить ${memberEmail} из студии?`)) return;
    try {
      await api(`/studios/${studio.studio.id}/members/${membershipId}`, { method: 'DELETE' });
      await loadMembers(studio.studio.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось исключить участника');
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  if (!studio) {
    return (
      <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold">Создайте студию</h2>
        <p className="mt-1 text-sm text-slate-500">
          Вы станете владельцем: появятся рабочие часы, персонал и расписание.
        </p>

        <form onSubmit={createStudio} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Название</span>
            <input
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Часовой пояс</span>
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="Europe/Moscow">Europe/Moscow</option>
              <option value="Europe/Kaliningrad">Europe/Kaliningrad</option>
              <option value="Asia/Yekaterinburg">Asia/Yekaterinburg</option>
              <option value="Asia/Novosibirsk">Asia/Novosibirsk</option>
            </select>
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {creating ? 'Создаём…' : 'Создать студию'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{studio.studio.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {studio.studio.timezone} · {describeHours(studio.workingHours)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {studio.myRoles.map((role) => (
                <span key={role} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Выйти
          </button>
        </div>
      </section>

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
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <label key={role} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="rounded border-slate-300"
                />
                {label}
              </label>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Приглашений нет: аккаунт должен существовать. Для роли «Ученик» аккаунт создаётся
            автоматически, а временный пароль показывается один раз.
          </p>
        </form>

        {tempPassword && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Временный пароль: <span className="font-mono font-semibold">{tempPassword}</span> — передайте
            ученику лично, больше он не показывается.
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
                          role === 'owner'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
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
    </div>
  );
}
