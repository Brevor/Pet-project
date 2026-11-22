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
import { OnboardingPage } from './OnboardingPage';
import { RoomsTab } from './RoomsTab';
import { ScheduleTab } from './ScheduleTab';
import { StaffTab } from './StaffTab';

type Tab = 'schedule' | 'courses' | 'rooms' | 'staff';

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
  const [linkInput, setLinkInput] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkNotice, setLinkNotice] = useState('');

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
      setLinkInput(view.referralCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить студию');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveLink(event: React.FormEvent) {
    event.preventDefault();
    if (!studio) return;
    setSavingLink(true);
    setLinkNotice('');
    try {
      await api(`/studios/${studio.studio.id}/referral`, {
        method: 'PATCH',
        body: JSON.stringify({ code: linkInput })
      });
      await load();
      setLinkNotice('Ссылка обновлена, старый адрес больше не работает');
    } catch (cause) {
      setLinkNotice(cause instanceof Error ? cause.message : 'Не удалось изменить ссылку');
    } finally {
      setSavingLink(false);
    }
  }

  async function copyLink() {
    if (!studio) return;
    const url = `${window.location.origin}${studio.referralUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkNotice('Ссылка скопирована');
    } catch {
      setLinkNotice(url);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  if (error) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  }

  if (!studio) {
    return (
      <div className="space-y-4">
        <OnboardingPage onChanged={() => void load()} />
      </div>
    );
  }

  const studioId = studio.studio.id;
  const canEditLink = studio.myRoles.some((role) => role === 'owner' || role === 'admin');
  const referralUrl = `${window.location.origin}${studio.referralUrl}`;

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

        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <h3 className="text-sm font-semibold">Ссылка для учеников</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-2 text-xs text-slate-700">
              {referralUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
            >
              Скопировать
            </button>
          </div>

          {canEditLink && (
            <form onSubmit={saveLink} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="block text-slate-500">Код ссылки</span>
                <input
                  value={linkInput}
                  onChange={(event) => setLinkInput(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={savingLink}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {savingLink ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </form>
          )}

          {linkNotice && <p className="mt-2 text-xs text-slate-600">{linkNotice}</p>}
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