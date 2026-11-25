import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  DAY_LABELS,
  courseColorHex,
  type Course,
  type Room,
  type SessionItem,
  type StudioView,
  type Teacher,
  type WorkingHour
} from '../types';

const MINUTE_STEP = 15;

function studioDateKey(moment: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(moment);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(dateKey: string): number {
  return (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function zonedMinutes(iso: string, timeZone: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute'))
  };
}

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function darkenForBorder(hex: string, amount = 0.35): string {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  const r = Math.round(((num >> 16) & 255) * (1 - amount) + 15 * amount);
  const g = Math.round(((num >> 8) & 255) * (1 - amount) + 23 * amount);
  const b = Math.round((num & 255) * (1 - amount) + 42 * amount);
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}
function hhmm(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${day}.${month}`;
}

interface Positioned {
  session: SessionItem;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

function layoutDay(items: Array<{ session: SessionItem; startMin: number; endMin: number }>): Positioned[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    return { ...item, lane, lanes: 1 };
  });
  const lanes = Math.max(laneEnds.length, 1);
  return placed.map((item) => ({ ...item, lanes }));
}

function visibleRange(
  hours: WorkingHour[],
  sessions: SessionItem[],
  timeZone: string
): { startHour: number; endHour: number } {
  const open = hours.filter((hour) => !hour.isClosed);
  let start = open.length > 0 ? Math.min(...open.map((hour) => minutesOf(hour.opensAt))) : 9 * 60;
  let end = open.length > 0 ? Math.max(...open.map((hour) => minutesOf(hour.closesAt))) : 22 * 60;
  for (const session of sessions) {
    const begin = zonedMinutes(session.startsAt, timeZone).minutes;
    const duration = Math.round(
      (Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000
    );
    start = Math.min(start, begin);
    end = Math.max(end, begin + duration);
  }
  const startHour = Math.max(0, Math.floor(start / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(end / 60)));
  return { startHour, endHour };
}

export function ScheduleTab({ studioId, canManage }: { studioId: string; canManage: boolean }) {
  const [studio, setStudio] = useState<StudioView | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(studioDateKey(new Date(), 'UTC')));
  const [roomFilter, setRoomFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; right: number; bottom: number } | null>(
    null
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [moveValue, setMoveValue] = useState('');
  const [narrow, setNarrow] = useState(false);
  const [mobileDay, setMobileDay] = useState(0);
  const [nowMinutes, setNowMinutes] = useState(0);
  const [gridHeightPx, setGridHeightPx] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [courseId, setCourseId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [mode, setMode] = useState<'single' | 'series'>('series');
  const [startsAt, setStartsAt] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState('18:00');
  const [startsOn, setStartsOn] = useState(weekStart);
  const [until, setUntil] = useState(addDays(weekStart, 27));

  const [hoursDraft, setHoursDraft] = useState<WorkingHour[]>([]);
  const [timezoneDraft, setTimezoneDraft] = useState('');
  const [editingHours, setEditingHours] = useState(false);

  const timeZone = studio?.studio.timezone ?? 'Europe/Moscow';
  const todayKey = studioDateKey(new Date(), timeZone);
  const canEditStudio = (studio?.myRoles ?? []).some((role) => role === 'owner' || role === 'admin');

  useEffect(() => {
    setWeekStart(mondayOf(studioDateKey(new Date(), timeZone)));
  }, [timeZone]);

  const loadStudio = useCallback(async () => {
    const view = await api<StudioView>(`/studios/${studioId}`);
    setStudio(view);
    setHoursDraft(view.workingHours);
    setTimezoneDraft(view.studio.timezone);
  }, [studioId]);

  useEffect(() => {
    void (async () => {
      const [roomList, courseList, teacherList] = await Promise.all([
        api<{ items: Room[] }>(`/studios/${studioId}/rooms`),
        api<{ items: Course[] }>(`/studios/${studioId}/courses`),
        api<{ items: Teacher[] }>(`/studios/${studioId}/teachers`)
      ]);
      setRooms(roomList.items);
      setCourses(courseList.items);
      setTeachers(teacherList.items);
      setCourseId(courseList.items[0]?.id ?? '');
      setRoomId(roomList.items[0]?.id ?? '');
    })().catch((cause) => setError(cause instanceof Error ? cause.message : 'Ошибка загрузки'));
    void loadStudio().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить студию')
    );
  }, [studioId, loadStudio]);

  useEffect(() => {
    const course = courses.find((item) => item.id === courseId);
    setTeacherId(course?.teacherMembershipId ?? '');
  }, [courseId, courses]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const tick = () => setNowMinutes(zonedMinutes(new Date().toISOString(), timeZone).minutes);
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const measure = () => setGridHeightPx(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [narrow]);

  const weekEnd = addDays(weekStart, 6);

  const loadSchedule = useCallback(async () => {
    const params = new URLSearchParams({ from: weekStart, to: weekEnd });
    if (roomFilter) params.set('roomId', roomFilter);
    if (teacherFilter) params.set('teacherMembershipId', teacherFilter);
    if (courseFilter) params.set('courseId', courseFilter);
    const data = await api<{ items: SessionItem[] }>(
      `/studios/${studioId}/schedule?${params.toString()}`
    );
    setSessions(data.items);
  }, [studioId, weekStart, weekEnd, roomFilter, teacherFilter, courseFilter]);

  useEffect(() => {
    void loadSchedule().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить расписание')
    );
  }, [loadSchedule]);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const range = visibleRange(studio?.workingHours ?? [], sessions, timeZone);
  const totalMinutes = (range.endHour - range.startHour) * 60;
  const availableHeight = Math.max(gridHeightPx - 44, 280);
  const pxPerMin = Math.min(1, Math.max(0.35, availableHeight / totalMinutes));
  const gridHeight = totalMinutes * pxPerMin;

  const hourMarks: number[] = [];
  for (let hour = range.startHour; hour <= range.endHour; hour += 1) hourMarks.push(hour);

  const byDay = new Map<string, Positioned[]>();
  for (const session of sessions) {
    const start = zonedMinutes(session.startsAt, timeZone);
    if (!days.includes(start.dateKey)) continue;
    const duration = Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000);
    const list = byDay.get(start.dateKey) ?? [];
    list.push({ session, startMin: start.minutes, endMin: start.minutes + duration, lane: 0, lanes: 1 });
    byDay.set(start.dateKey, list);
  }
  for (const [key, list] of byDay) byDay.set(key, layoutDay(list));

  const colorByCourse = new Map<string, string>();
  for (const course of courses) colorByCourse.set(course.id, courseColorHex(course.color));

  const selected = sessions.find((session) => session.sessionId === selectedId) ?? null;

  const [isMobileSheet, setIsMobileSheet] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const onResize = () => setIsMobileSheet(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  function popoverPosition() {
    const width = 280;
    const margin = 8;
    if (!anchor) return { top: 80, left: 80 };
    let left = anchor.right + margin;
    if (left + width > window.innerWidth - margin) left = anchor.left - width - margin;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(anchor.top, window.innerHeight - 320));
    return { top, left };
  }



  function moveBlockFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    day: string,
    startMin: number
  ) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const blocks = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-session]') ?? []
    );
    if (blocks.length === 0) return;
    const current = blocks.findIndex(
      (block) => block.dataset.day === day && Number(block.dataset.start) === startMin
    );
    if (current < 0) return;
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    event.preventDefault();
    blocks[(current + delta + blocks.length) % blocks.length]?.focus();
  }

  useEffect(() => {
    if (!selectedId) return;
    popoverRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null);
    }
    function onPointerDown(event: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setSelectedId(null);
      }
    }
    function onScroll() {
      setSelectedId(null);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      lastFocusedRef.current?.focus();
    };
  }, [selectedId]);
  const visibleDays = narrow ? [days[mobileDay] ?? days[0]!] : days;

  useEffect(() => {
    if (!selected) return;
    const start = zonedMinutes(selected.startsAt, timeZone);
    setMoveValue(`${start.dateKey}T${hhmm(start.minutes)}`);
  }, [selected, timeZone]);

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const teacherPayload = teacherId ? { teacherMembershipId: teacherId } : {};
      if (mode === 'single') {
        await api(`/studios/${studioId}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            courseId,
            roomId,
            ...teacherPayload,
            startsAt: new Date(startsAt).toISOString()
          })
        });
      } else {
        await api(`/studios/${studioId}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            courseId,
            roomId,
            ...teacherPayload,
            series: { weekdays, startTime, startsOn, until }
          })
        });
      }
      await loadSchedule();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать сеанс');
    }
  }

  async function saveHours(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const view = await api<StudioView>(`/studios/${studioId}`, {
        method: 'PATCH',
        body: JSON.stringify({ timezone: timezoneDraft, workingHours: hoursDraft })
      });
      setStudio(view);
      setHoursDraft(view.workingHours);
      setEditingHours(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить часы работы');
    }
  }

  async function cancelSession(session: SessionItem) {
    setError('');
    try {
      await api(`/studios/${studioId}/sessions/${session.sessionId}/cancel`, { method: 'POST' });
      await loadSchedule();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отменить сеанс');
    }
  }

  async function removeSession(session: SessionItem) {
    if (!confirm('Удалить сеанс?')) return;
    setError('');
    try {
      await api(`/studios/${studioId}/sessions/${session.sessionId}`, { method: 'DELETE' });
      setSelectedId(null);
      await loadSchedule();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить сеанс');
    }
  }

  async function moveSession(session: SessionItem) {
    if (!moveValue) return;
    setError('');
    try {
      await api(`/studios/${studioId}/sessions/${session.sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ startsAt: new Date(moveValue).toISOString() })
      });
      await loadSchedule();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось перенести сеанс');
    }
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  }

  function pickSlot(dateKey: string, minutes: number) {
    if (!canManage) return;
    setMode('single');
    setStartsAt(`${dateKey}T${hhmm(minutes)}`);
    setError('');
  }

  function patchHour(index: number, patch: Partial<WorkingHour>) {
    setHoursDraft((current) =>
      current.map((hour, position) => (position === index ? { ...hour, ...patch } : hour))
    );
  }

  const hoursLabel = (hour: WorkingHour | undefined): string => {
    if (!hour) return '—';
    return hour.isClosed ? 'выходной' : `${hour.opensAt}–${hour.closesAt}`;
  };

  return (
    <section className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="w-full space-y-4 xl:w-72 xl:shrink-0">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{studio?.studio.name ?? 'Студия'}</h3>
            {canEditStudio && !editingHours && (
              <button
                type="button"
                onClick={() => setEditingHours(true)}
                className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-subtle"
              >
                Изменить
              </button>
            )}
          </div>

          {!editingHours ? (
            <>
              <p className="mt-1 text-xs text-faint">{timeZone}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {(studio?.workingHours ?? []).map((hour) => (
                  <li key={hour.weekday} className="flex justify-between gap-2">
                    <span>{DAY_LABELS[hour.weekday - 1]}</span>
                    <span className={hour.isClosed ? 'text-faint' : ''}>
                      {hoursLabel(hour)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form onSubmit={saveHours} className="mt-2 space-y-2 text-xs">
              <label className="block">
                <span className="text-faint">Часовой пояс</span>
                <input
                  value={timezoneDraft}
                  onChange={(event) => setTimezoneDraft(event.target.value)}
                  className="mt-1 w-full rounded border border-line-strong px-2 py-1"
                />
              </label>
              {hoursDraft.map((hour, index) => (
                <div key={hour.weekday} className="flex items-center gap-1">
                  <span className="w-6 text-faint">{DAY_LABELS[hour.weekday - 1]}</span>
                  <input
                    type="time"
                    value={hour.opensAt}
                    disabled={hour.isClosed}
                    onChange={(event) => patchHour(index, { opensAt: event.target.value })}
                    className="w-[74px] rounded border border-line-strong px-1 py-0.5 disabled:bg-subtle"
                  />
                  <input
                    type="time"
                    value={hour.closesAt}
                    disabled={hour.isClosed}
                    onChange={(event) => patchHour(index, { closesAt: event.target.value })}
                    className="w-[74px] rounded border border-line-strong px-1 py-0.5 disabled:bg-subtle"
                  />
                  <label className="ml-auto flex items-center gap-1 text-faint">
                    <input
                      type="checkbox"
                      checked={hour.isClosed}
                      onChange={(event) => patchHour(index, { isClosed: event.target.checked })}
                    />
                    вых.
                  </label>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="rounded bg-brand px-3 py-1 font-semibold text-white hover:bg-brand-hover"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHours(false);
                    setHoursDraft(studio?.workingHours ?? []);
                    setTimezoneDraft(timeZone);
                  }}
                  className="rounded border border-line-strong px-3 py-1 text-muted"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>

        {canManage && (
          <form onSubmit={createSession} className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
            <h3 className="font-semibold">Новое занятие</h3>
            <label className="block text-xs">
              <span className="text-faint">Курс</span>
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                required
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-faint">Зал</span>
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                required
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-faint">Преподаватель</span>
              <select
                value={teacherId}
                onChange={(event) => setTeacherId(event.target.value)}
                className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                required
              >
                <option value="">выберите</option>
                {teachers.map((teacher) => (
                  <option key={teacher.membershipId} value={teacher.membershipId}>
                    {teacher.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-faint">Тип</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as 'single' | 'series')}
                className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
              >
                <option value="series">серия</option>
                <option value="single">разовый</option>
              </select>
            </label>

            {mode === 'single' ? (
              <label className="block text-xs">
                <span className="text-faint">Начало</span>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                  className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                />
              </label>
            ) : (
              <>
                <div className="text-xs">
                  <span className="text-faint">Дни недели</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {DAY_LABELS.map((label, index) => (
                      <label key={label} className="flex items-center gap-0.5">
                        <input
                          type="checkbox"
                          checked={weekdays.includes(index + 1)}
                          onChange={() => toggleWeekday(index + 1)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block text-xs">
                  <span className="text-faint">Время</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                  />
                </label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs">
                    <span className="text-faint">С даты</span>
                    <input
                      type="date"
                      value={startsOn}
                      onChange={(event) => setStartsOn(event.target.value)}
                      className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                    />
                  </label>
                  <label className="block flex-1 text-xs">
                    <span className="text-faint">По дату</span>
                    <input
                      type="date"
                      value={until}
                      onChange={(event) => setUntil(event.target.value)}
                      className="mt-1 w-full rounded border border-line-strong px-2 py-1.5"
                    />
                  </label>
                </div>
              </>
            )}

            <p className="text-[11px] text-faint">
              Длительность берётся из курса. Клик по пустому месту в календаре подставит дату и время.
            </p>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Создать
            </button>
          </form>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-subtle"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(todayKey))}
            className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-subtle"
          >
            сегодня
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-subtle"
          >
            →
          </button>
          <span className="text-xs font-medium text-ink">
            {shortDate(weekStart)} — {shortDate(weekEnd)}
          </span>
          <span className="hidden text-xs text-faint sm:inline">{timeZone}</span>

          <div className="ml-auto flex flex-wrap items-center gap-1">
            <select
              value={roomFilter}
              onChange={(event) => setRoomFilter(event.target.value)}
              className="rounded border border-line-strong px-1.5 py-1 text-xs"
            >
              <option value="">все залы</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <select
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
              className="rounded border border-line-strong px-1.5 py-1 text-xs"
            >
              <option value="">все преподаватели</option>
              {teachers.map((teacher) => (
                <option key={teacher.membershipId} value={teacher.membershipId}>
                  {teacher.displayName}
                </option>
              ))}
            </select>
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              className="rounded border border-line-strong px-1.5 py-1 text-xs"
            >
              <option value="">все курсы</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {narrow && (
          <div className="flex gap-1 overflow-x-auto">
            {days.map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => setMobileDay(index)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  index === mobileDay ? 'bg-brand text-white' : 'border border-line text-muted'
                }`}
              >
                {DAY_LABELS[weekdayIndex(day)]} {shortDate(day)}
              </button>
            ))}
          </div>
        )}

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="rounded-xl border border-line bg-surface">
          <div ref={gridRef} className="flex h-[calc(100vh-230px)] min-h-[420px] flex-col overflow-hidden">
            <div className="flex shrink-0 border-b border-line bg-surface">
              <div className="w-12 shrink-0" />
              {visibleDays.map((day) => {
                const isToday = day === todayKey;
                return (
                  <div
                    key={day}
                    className={`flex-1 border-l border-line px-1 py-1 text-center text-[11px] font-medium ${
                      isToday ? 'bg-brand-soft text-ink' : 'text-muted'
                    }`}
                  >
                    <span className="block">
                      {DAY_LABELS[weekdayIndex(day)]} {shortDate(day)}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => pickSlot(day, range.startHour * 60)}
                        aria-label={`Создать занятие: ${DAY_LABELS[weekdayIndex(day)]} ${shortDate(day)}`}
                        className="mt-0.5 text-[10px] font-medium text-brand hover:underline"
                      >
                        + занятие
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex min-h-0 flex-1 overflow-y-auto">
              <div className="relative w-12 shrink-0" style={{ height: gridHeight }}>
                {hourMarks.map((hour) => (
                  <div
                    key={hour}
                    className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-faint"
                    style={{ top: (hour - range.startHour) * 60 * pxPerMin }}
                  >
                    {hhmm(hour * 60)}
                  </div>
                ))}
              </div>

              {visibleDays.map((day) => {
                const items = byDay.get(day) ?? [];
                const isToday = day === todayKey;
                return (
                  <div
                    key={day}
                    className={`relative flex-1 border-l border-line ${
                      isToday ? 'bg-brand-soft' : ''
                    }`}
                    style={{ height: gridHeight }}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offsetY = event.clientY - rect.top;
                      const minutes =
                        range.startHour * 60 +
                        Math.max(0, Math.round(offsetY / pxPerMin / MINUTE_STEP) * MINUTE_STEP);
                      pickSlot(day, minutes);
                    }}
                  >
                    {hourMarks.map((hour) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 border-t border-line"
                        style={{ top: (hour - range.startHour) * 60 * pxPerMin }}
                      />
                    ))}

                    {isToday && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-rose-500"
                        style={{ top: (nowMinutes - range.startHour * 60) * pxPerMin }}
                      >
                        <span className="absolute -top-4 right-1 rounded bg-danger px-1 text-[10px] font-semibold tabular-nums text-white">
                          {hhmm(nowMinutes)}
                        </span>
                      </div>
                    )}

                    {items.map((item) => {
                      const top = (item.startMin - range.startHour * 60) * pxPerMin;
                      const height = Math.max((item.endMin - item.startMin) * pxPerMin, 24);
                      const width = 100 / item.lanes;
                      const cancelled = item.session.status === 'cancelled';
                      const active = item.session.sessionId === selectedId;
                      const color = colorByCourse.get(item.session.courseId) ?? '#8b5cf6';
                      return (
                        <button
                          key={item.session.sessionId}
                          type="button"
                          data-session="1"
                          data-day={day}
                          data-start={item.startMin}
                          onKeyDown={(event) => moveBlockFocus(event, day, item.startMin)}
                          onClick={(event) => {
                            event.stopPropagation();
                            lastFocusedRef.current = event.currentTarget;
                            setAnchor(event.currentTarget.getBoundingClientRect());
                            setSelectedId(active ? null : item.session.sessionId);
                          }}
                          aria-label={`${item.session.courseName}, ${hhmm(item.startMin)}–${hhmm(item.endMin)}, ${item.session.roomName}, ${item.session.teacherName}`}
                          className={`absolute overflow-hidden rounded-sm border py-0.5 pl-2 pr-1 text-left text-[11px] text-ink shadow-sm transition-shadow hover:shadow-card ${
                            cancelled ? 'border-dashed' : ''
                          } ${active ? 'ring-2 ring-brand' : ''}`}
                          style={{
                            top,
                            height,
                            left: `${item.lane * width}%`,
                            width: `calc(${width}% - 2px)`,
                            backgroundColor: `${color}1F`,
                            borderColor: darkenForBorder(color)
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-[3px]"
                            style={{ backgroundColor: color }}
                          />
                          <span className="block font-mono text-[10px] tabular-nums text-muted">
                            {hhmm(item.startMin)}–{hhmm(item.endMin)}
                          </span>
                          <span className="block truncate text-xs font-semibold">
                            {item.session.courseName}
                          </span>
                          {height > 48 && (
                            <span className="block truncate text-[10px] text-muted">
                              {item.session.roomName} · {item.session.teacherName}
                            </span>
                          )}
                          {cancelled && (
                            <span className="block text-[10px] font-semibold uppercase text-danger">
                              отменён
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {selected &&
                      byDay.get(day)?.some((item) => item.session.sessionId === selected.sessionId) && (
                        <>
                        {isMobileSheet && (
                          <div
                            className="fixed inset-0 z-40 bg-black/40"
                            aria-hidden="true"
                            onClick={() => setSelectedId(null)}
                          />
                        )}
                        <div
                          ref={popoverRef}
                          role="dialog"
                          aria-label={`Занятие: ${selected.courseName}`}
                          tabIndex={-1}
                          className={`fixed z-50 w-[280px] rounded-md border border-line bg-surface p-2.5 text-xs shadow-pop outline-none ${
                            isMobileSheet ? 'max-h-[70vh] overflow-y-auto' : ''
                          }`}
                          style={
                            isMobileSheet
                              ? { left: 8, right: 8, bottom: 8, width: 'auto' }
                              : popoverPosition()
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-ink">
                              {selected.courseName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedId(null)}
                              className="rounded px-1 text-faint hover:bg-subtle"
                            >
                              ×
                            </button>
                          </div>
                          <p className="mt-0.5 text-muted">
                            {hhmm(zonedMinutes(selected.startsAt, timeZone).minutes)}–
                            {hhmm(
                              zonedMinutes(selected.startsAt, timeZone).minutes +
                                Math.round(
                                  (Date.parse(selected.endsAt) - Date.parse(selected.startsAt)) /
                                    60_000
                                )
                            )}{' '}
                            · {selected.roomName}
                          </p>
                          <p className="text-muted">{selected.teacherName}</p>
                          {selected.status === 'cancelled' && (
                            <p className="mt-1 font-semibold uppercase text-danger">отменён</p>
                          )}
                          {canManage && (
                            <div className="mt-1.5 space-y-1.5">
                              <input
                                type="datetime-local"
                                value={moveValue}
                                onChange={(event) => setMoveValue(event.target.value)}
                                className="w-full rounded border border-line-strong px-1.5 py-1"
                              />
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => void moveSession(selected)}
                                  className="rounded border border-line-strong px-1.5 py-0.5 text-ink hover:bg-subtle"
                                >
                                  Перенести
                                </button>
                                {selected.status === 'scheduled' && (
                                  <button
                                    type="button"
                                    onClick={() => void cancelSession(selected)}
                                    className="rounded border border-warning-border px-1.5 py-0.5 text-warning hover:bg-warning-soft"
                                  >
                                    Отменить
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void removeSession(selected)}
                                  className="rounded border border-danger-border px-1.5 py-0.5 text-danger hover:bg-danger-soft"
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        </>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {sessions.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-faint">
            На этой неделе сеансов нет
          </p>
        )}
      </div>
    </section>
  );
}
