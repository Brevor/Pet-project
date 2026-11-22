import { useCallback, useEffect, useMemo, useState } from 'react';
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

const PX_PER_MIN = 1.2;
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
  const [moveValue, setMoveValue] = useState('');
  const [narrow, setNarrow] = useState(false);
  const [mobileDay, setMobileDay] = useState(0);

  const [courseId, setCourseId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [mode, setMode] = useState<'single' | 'series'>('series');
  const [startsAt, setStartsAt] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState('18:00');
  const [startsOn, setStartsOn] = useState(weekStart);
  const [until, setUntil] = useState(addDays(weekStart, 27));

  const timeZone = studio?.studio.timezone ?? 'Europe/Moscow';
  const todayKey = studioDateKey(new Date(), timeZone);

  useEffect(() => {
    setWeekStart(mondayOf(studioDateKey(new Date(), timeZone)));
  }, [timeZone]);

  useEffect(() => {
    void (async () => {
      const [studioView, roomList, courseList, teacherList] = await Promise.all([
        api<StudioView>(`/studios/${studioId}`),
        api<{ items: Room[] }>(`/studios/${studioId}/rooms`),
        api<{ items: Course[] }>(`/studios/${studioId}/courses`),
        api<{ items: Teacher[] }>(`/studios/${studioId}/teachers`)
      ]);
      setStudio(studioView);
      setRooms(roomList.items);
      setCourses(courseList.items);
      setTeachers(teacherList.items);
      setCourseId(courseList.items[0]?.id ?? '');
      setRoomId(roomList.items[0]?.id ?? '');
    })().catch((cause) => setError(cause instanceof Error ? cause.message : 'Ошибка загрузки'));
  }, [studioId]);

  useEffect(() => {
    const course = courses.find((item) => item.id === courseId);
    setTeacherId(course?.teacherMembershipId ?? '');
  }, [courseId, courses]);

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

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const range = visibleRange(studio?.workingHours ?? [], sessions, timeZone);
  const totalMinutes = (range.endHour - range.startHour) * 60;
  const gridHeight = totalMinutes * PX_PER_MIN;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let hour = range.startHour; hour <= range.endHour; hour += 1) marks.push(hour);
    return marks;
  }, [range.startHour, range.endHour]);

  const byDay = useMemo(() => {    const map = new Map<string, Positioned[]>();
    for (const session of sessions) {
      const start = zonedMinutes(session.startsAt, timeZone);
      if (!days.includes(start.dateKey)) continue;
      const duration = Math.round(
        (Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000
      );
      const list = map.get(start.dateKey) ?? [];
      list.push({ session, startMin: start.minutes, endMin: start.minutes + duration, lane: 0, lanes: 1 });
      map.set(start.dateKey, list);
    }
    for (const [key, list] of map) map.set(key, layoutDay(list));
    return map;
  }, [sessions, days, timeZone]);

  const selected = sessions.find((session) => session.sessionId === selectedId) ?? null;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const colorByCourse = useMemo(() => {
    const map = new Map<string, string>();
    for (const course of courses) map.set(course.id, courseColorHex(course.color));
    return map;
  }, [courses]);

  const hoursByWeekday = useMemo(() => {
    const map = new Map<
      number,
      { label: string; startMin: number; endMin: number; closed: boolean }
    >();
    for (const hour of studio?.workingHours ?? []) {
      map.set(
        hour.weekday,
        hour.isClosed
          ? { label: 'выходной', startMin: 0, endMin: 0, closed: true }
          : {
              label: `${hour.opensAt}–${hour.closesAt}`,
              startMin: minutesOf(hour.opensAt),
              endMin: minutesOf(hour.closesAt),
              closed: false
            }
      );
    }
    return map;
  }, [studio?.workingHours]);

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

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            ← неделя
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(todayKey))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            сегодня
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            неделя →
          </button>
          <p className="ml-2 text-sm font-medium text-slate-700">
            {shortDate(weekStart)} — {shortDate(weekEnd)}
          </p>
          <span className="text-xs text-slate-400">{timeZone}</span>
        </div>

        <p className="text-xs text-slate-500">
          Часы студии:{' '}
          {DAY_LABELS.map(
            (label, index) => `${label} ${hoursByWeekday.get(index + 1)?.label ?? '—'}`
          ).join(' · ')}
        </p>

        {narrow && (
          <div className="flex gap-1 overflow-x-auto">
            {days.map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => setMobileDay(index)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  index === mobileDay
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 text-slate-600'
                }`}
              >
                {DAY_LABELS[weekdayIndex(day)]} {shortDate(day)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-600">Зал</span>
            <select
              value={roomFilter}
              onChange={(event) => setRoomFilter(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">все</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600">Преподаватель</span>
            <select
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">все</option>
              {teachers.map((teacher) => (
                <option key={teacher.membershipId} value={teacher.membershipId}>
                  {teacher.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600">Курс</span>
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">все</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {canManage && (
        <form
          onSubmit={createSession}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-slate-600">Курс</span>
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                required
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600">Зал</span>
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                required
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600">Преподаватель</span>
              <select
                value={teacherId}
                onChange={(event) => setTeacherId(event.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
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
            <label className="text-sm">
              <span className="block text-slate-600">Тип</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as 'single' | 'series')}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="series">серия</option>
                <option value="single">разовый</option>
              </select>
            </label>
          </div>

          {mode === 'single' ? (
            <label className="block text-sm">
              <span className="text-slate-600">Начало</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-sm">
                <span className="block text-slate-600">Дни недели</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, index) => (
                    <label key={label} className="flex items-center gap-1">
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
              <label className="text-sm">
                <span className="block text-slate-600">Время</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600">С даты</span>
                <input
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600">По дату</span>
                <input
                  type="date"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Длительность сеанса равна длительности курса и не редактируется. Клик по пустому месту
            в календаре подставит дату и время в «Начало».
          </p>

          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Создать
          </button>
        </form>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className={narrow ? '' : 'min-w-[900px]'}>
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div className="w-14 shrink-0" />
            {visibleDays.map((day) => {
              const isToday = day === todayKey;
              return (
                <div
                  key={day}
                  className={`flex-1 border-l border-slate-100 px-2 py-2 text-center text-xs font-medium ${
                    isToday ? 'bg-violet-50 text-violet-700' : 'text-slate-600'
                  }`}
                >
                  {DAY_LABELS[weekdayIndex(day)]} {shortDate(day)}
                </div>
              );
            })}
          </div>

          <div className="relative flex">
            <div className="relative w-14 shrink-0" style={{ height: gridHeight }}>
              {hourMarks.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 font-mono text-xs text-slate-400"
                  style={{ top: (hour - range.startHour) * 60 * PX_PER_MIN }}
                >
                  {hhmm(hour * 60)}
                </div>
              ))}
            </div>

            {visibleDays.map((day) => {
              const items = byDay.get(day) ?? [];
              const work = hoursByWeekday.get(weekdayIndex(day) + 1);
              return (
                <div
                  key={day}
                  className={`relative flex-1 border-l border-slate-100 ${
                    day === todayKey ? 'bg-violet-50/40' : ''
                  }`}
                  style={{ height: gridHeight }}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const offsetY = event.clientY - rect.top;
                    const minutes =
                      range.startHour * 60 +
                      Math.max(
                        0,
                        Math.round((offsetY / PX_PER_MIN) / MINUTE_STEP) * MINUTE_STEP
                      );
                    pickSlot(day, minutes);
                  }}
                >
                  {work && !work.closed && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-x-0 bg-slate-50"
                        style={{
                          top: 0,
                          height: Math.max(
                            (work.startMin - range.startHour * 60) * PX_PER_MIN,
                            0
                          )
                        }}
                      />
                      <div
                        className="pointer-events-none absolute inset-x-0 bg-slate-50"
                        style={{
                          top: (work.endMin - range.startHour * 60) * PX_PER_MIN,
                          bottom: 0
                        }}
                      />
                    </>
                  )}
                  {work?.closed && (
                    <div className="pointer-events-none absolute inset-0 bg-slate-100" />
                  )}
                  {hourMarks.map((hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: (hour - range.startHour) * 60 * PX_PER_MIN }}
                    />
                  ))}

                  {items.map((item) => {
                    const top = (item.startMin - range.startHour * 60) * PX_PER_MIN;
                    const height = Math.max((item.endMin - item.startMin) * PX_PER_MIN, 18);
                    const width = 100 / item.lanes;
                    const cancelled = item.session.status === 'cancelled';
                    const active = item.session.sessionId === selectedId;
                    const color = colorByCourse.get(item.session.courseId) ?? '#8b5cf6';
                    return (
                      <button
                        key={item.session.sessionId}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(active ? null : item.session.sessionId);
                        }}
                        title={`${item.session.courseName} · ${item.session.roomName} · ${item.session.teacherName}`}
                        className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs text-slate-800 shadow-sm ${
                          cancelled ? 'border-dashed' : ''
                        } ${active ? 'ring-2 ring-slate-400' : ''}`}
                        style={{
                          top,
                          height,
                          left: `${item.lane * width}%`,
                          width: `calc(${width}% - 2px)`,
                          backgroundColor: `${color}24`,
                          borderColor: color
                        }}
                      >
                        <span className="block font-mono text-[11px] text-slate-500">
                          {hhmm(item.startMin)}–{hhmm(item.endMin)}
                        </span>
                        <span className="block truncate font-medium">{item.session.courseName}</span>
                        {height > 46 && (
                          <span className="block truncate text-[11px] text-slate-500">
                            {item.session.roomName} · {item.session.teacherName}
                          </span>
                        )}
                        {cancelled && (
                          <span className="mt-0.5 block text-[10px] font-semibold uppercase">
                            отменён
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {selected &&
                    byDay
                      .get(day)
                      ?.some((item) => item.session.sessionId === selected.sessionId) && (
                      <div
                        className="absolute z-30 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl"
                        style={{
                          top: Math.max(
                            (zonedMinutes(selected.startsAt, timeZone).minutes -
                              range.startHour * 60) *
                              PX_PER_MIN -
                              8,
                            0
                          ),
                          left: '25%'
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            {selected.courseName}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            className="rounded px-1 text-slate-400 hover:bg-slate-100"
                          >
                            ×
                          </button>
                        </div>
                        <p className="mt-1 text-slate-600">
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
                        <p className="text-slate-600">{selected.teacherName}</p>
                        {selected.status === 'cancelled' && (
                          <p className="mt-1 font-semibold uppercase text-rose-600">отменён</p>
                        )}
                        {canManage && (
                          <div className="mt-2 space-y-2">
                            <input
                              type="datetime-local"
                              value={moveValue}
                              onChange={(event) => setMoveValue(event.target.value)}
                              className="w-full rounded border border-slate-300 px-2 py-1"
                            />
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => void moveSession(selected)}
                                className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                              >
                                Перенести
                              </button>
                              {selected.status === 'scheduled' && (
                                <button
                                  type="button"
                                  onClick={() => void cancelSession(selected)}
                                  className="rounded border border-amber-300 px-2 py-1 text-amber-700 hover:bg-amber-50"
                                >
                                  Отменить
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void removeSession(selected)}
                                className="rounded border border-rose-300 px-2 py-1 text-rose-600 hover:bg-rose-50"
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {sessions.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          На этой неделе сеансов нет
        </p>
      )}

    </section>
  );
}
