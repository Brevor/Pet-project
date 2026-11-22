import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { DAY_LABELS, type Course, type Room, type SessionItem, type Teacher } from '../types';

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekBounds(): { from: string; to: string } {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(sunday) };
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function ScheduleTab({ studioId, canManage }: { studioId: string; canManage: boolean }) {
  const bounds = weekBounds();
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [roomFilter, setRoomFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState('');

  const [courseId, setCourseId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [mode, setMode] = useState<'single' | 'series'>('series');
  const [startsAt, setStartsAt] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState('18:00');
  const [startsOn, setStartsOn] = useState(bounds.from);
  const [until, setUntil] = useState(bounds.to);

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
  }, [studioId]);

  useEffect(() => {
    const course = courses.find((item) => item.id === courseId);
    setTeacherId(course?.teacherMembershipId ?? '');
  }, [courseId, courses]);

  const loadSchedule = useCallback(async () => {
    const params = new URLSearchParams({ from, to });
    if (roomFilter) params.set('roomId', roomFilter);
    if (teacherFilter) params.set('teacherMembershipId', teacherFilter);
    if (courseFilter) params.set('courseId', courseFilter);
    const data = await api<{ items: SessionItem[] }>(
      `/studios/${studioId}/schedule?${params.toString()}`
    );
    setSessions(data.items);
  }, [studioId, from, to, roomFilter, teacherFilter, courseFilter]);

  useEffect(() => {
    void loadSchedule().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить расписание')
    );
  }, [loadSchedule]);

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
            series: {
              weekdays,
              startTime,
              startsOn,
              until
            }
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
      await loadSchedule();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить сеанс');
    }
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  }

  const grouped = new Map<string, SessionItem[]>();
  for (const session of sessions) {
    const key = dayLabel(session.startsAt);
    const list = grouped.get(key) ?? [];
    list.push(session);
    grouped.set(key, list);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="block text-slate-600">С</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">По</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
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
            Длительность сеанса равна длительности курса и не редактируется.
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

      <div className="space-y-4">
        {[...grouped.entries()].map(([day, items]) => (
          <article key={day} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">{day}</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {items.map((session) => (
                <li key={session.sessionId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="w-14 font-mono text-slate-600">{timeLabel(session.startsAt)}</span>
                  <span className="font-medium">{session.courseName}</span>
                  <span className="text-slate-500">{session.roomName}</span>
                  <span className="text-slate-500">{session.teacherName}</span>
                  {session.status === 'cancelled' && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                      отменён
                    </span>
                  )}
                  {canManage && (
                    <span className="ml-auto flex gap-2">
                      {session.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => cancelSession(session)}
                          className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                        >
                          Отменить
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeSession(session)}
                        className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        Удалить
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {sessions.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            В выбранном периоде сеансов нет
          </p>
        )}
      </div>
    </section>
  );
}
