import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  DAY_LABELS,
  ROLE_LABELS,
  type Membership,
  type StudioView,
  type WorkingHour
} from '../types';
import { Badge } from '../ui/Card';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { Skeleton } from '../ui/States';
import { Tabs } from '../ui/Tabs';
import { CoursesTab } from './CoursesTab';
import { OnboardingPage } from './OnboardingPage';
import { RoomsTab } from './RoomsTab';
import { ScheduleTab } from './ScheduleTab';
import { StaffTab } from './StaffTab';
import { StudentsTab } from './StudentsTab';

type Tab = 'schedule' | 'courses' | 'rooms' | 'staff' | 'students';

const ALL_TABS: Array<{ id: Tab; label: string }> = [
  { id: 'schedule', label: 'Расписание' },
  { id: 'courses', label: 'Курсы' },
  { id: 'rooms', label: 'Залы' },
  { id: 'staff', label: 'Команда' },
  { id: 'students', label: 'Ученики' }
];

function describeHours(hours: WorkingHour[]): string {
  const open = hours.filter((hour) => !hour.isClosed);
  if (open.length === 0) return 'Студия закрыта';
  const closed = hours.filter((hour) => hour.isClosed).map((hour) => DAY_LABELS[hour.weekday - 1]);
  const first = open[0]!;
  const base = `${first.opensAt}–${first.closesAt}`;
  return closed.length > 0 ? `${base}, выходной: ${closed.join(', ')}` : base;
}

export function StudioPage() {
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
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="card space-y-3 p-4 md:p-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <InlineAlert variant="error">{error}</InlineAlert>;
  }

  if (!studio) {
    return (
      <div className="space-y-4">
        <OnboardingPage onChanged={() => void load()} />
      </div>
    );
  }

  const studioId = studio.studio.id;
  const roles = studio.myRoles;
  const canManageStaff = roles.some((role) => role === 'owner' || role === 'admin');
  const canManageStudents = canManageStaff || roles.includes('curator');
  const canManageSchedule = canManageStudents;
  const canManageCourses = canManageStudents;
  const canManageRooms = canManageStudents;
  const canEditLink = canManageStaff;
  const isStudentOnly = roles.every((role) => role === 'student');
  const visibleTabs = ALL_TABS.filter((item) => {
    if (item.id === 'courses') return true;
    if (item.id === 'staff') return !isStudentOnly;
    if (item.id === 'students') return canManageStudents;
    if (item.id === 'rooms') return canManageRooms;
    return true;
  });
  const referralUrl = `${window.location.origin}${studio.referralUrl}`;

  return (
    <div className="space-y-4">
      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{studio.studio.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {studio.studio.timezone} · {describeHours(studio.workingHours)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {studio.myRoles.map((role) => (
                <Badge key={role} tone="brand">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md bg-subtle p-4">
          <h3 className="text-sm font-semibold">Ссылка для учеников</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-surface px-3 py-2 text-xs text-muted">
              {referralUrl}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copyLink()}>
              Скопировать
            </Button>
          </div>

          {canEditLink && (
            <form onSubmit={saveLink} className="mt-3 flex flex-wrap items-end gap-2">
              <label htmlFor="referral-code" className="min-w-[180px]">
                <span className="label">Код ссылки</span>
                <input
                  id="referral-code"
                  value={linkInput}
                  onChange={(event) => setLinkInput(event.target.value)}
                  className="input"
                />
              </label>
              <Button type="submit" size="sm" disabled={savingLink}>
                {savingLink ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </form>
          )}

          {linkNotice && <p className="mt-2 text-xs text-muted">{linkNotice}</p>}
        </div>
      </section>

      <Tabs ariaLabel="Разделы студии" items={visibleTabs} value={tab} onChange={setTab} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'staff' && <StaffTab studioId={studioId} canManage={canManageStaff} />}
        {tab === 'students' && <StudentsTab studioId={studioId} canExclude={canManageStaff} />}
        {tab === 'rooms' && <RoomsTab studioId={studioId} />}
        {tab === 'courses' && <CoursesTab studioId={studioId} canManage={canManageCourses} />}
        {tab === 'schedule' && <ScheduleTab studioId={studioId} canManage={canManageSchedule} />}
      </div>
    </div>
  );
}