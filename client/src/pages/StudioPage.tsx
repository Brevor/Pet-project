import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  DAY_LABELS,
  ROLE_LABELS,
  type Membership,
  type StudioView,
  type WorkingHour
} from '../types';
import { CoursesTab } from './CoursesTab';
import { RoomsTab } from './RoomsTab';
import { ScheduleTab } from './ScheduleTab';
import { StaffTab } from './StaffTab';

type Tab = 'staff' | 'rooms' | 'courses' | 'schedule';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'schedule', label: 'Расписание' },
  { id: 'courses', label: 'Курсы' },
  { id: 'rooms', label: 'Залы' },
  { id: 'staff', label: 'Команда' }
];

function describeHours(hours: WorkingHour[]): string {
  const open = hours.filter((hour) => !hour.isClosed);
  if (open.length === 0) return 'Студия закрыта';
  const closed = hours.filter((hour) => hour.isClosed).map((hour) => DAY_LABELS[hour.weekday - 1]);
  const first = open[0]!;
  const base = `${first.opensAt}–${first.closesAt}`;
  return closed.length > 0 ? `${base}, выходной: ${closed.join(', ')}` : base;
}

export function StudioPage({ onLogout }: { onLogout: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studio, setStudio] = useState<StudioView | null>(null);
  const [tab, setTab] = useState<Tab>('schedule');

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [creating, setCreating] = useState(false);

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить студию');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const studioId = studio.studio.id;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{studio.studio.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {studio.studio.timezone} · {describeHours(studio.workingHours)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {studio.myRoles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700"
                >
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

      <nav className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === item.id
                ? 'bg-violet-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'staff' && <StaffTab studioId={studioId} />}
      {tab === 'rooms' && <RoomsTab studioId={studioId} />}
      {tab === 'courses' && <CoursesTab studioId={studioId} />}
      {tab === 'schedule' && <ScheduleTab studioId={studioId} />}
    </div>
  );
}
