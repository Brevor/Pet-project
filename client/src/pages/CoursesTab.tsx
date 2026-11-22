import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { KIND_LABELS, LEVEL_LABELS, type Course } from '../types';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'none'];
const KINDS = ['group', 'individual'];
const DURATIONS = [45, 60, 75, 90, 120];

export function CoursesTab({ studioId }: { studioId: string }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('');
  const [level, setLevel] = useState('beginner');
  const [kind, setKind] = useState('group');
  const [duration, setDuration] = useState(90);
  const [capacity, setCapacity] = useState(12);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await api<{ items: Course[] }>(`/studios/${studioId}/courses?includeArchived=true`);
    setCourses(data.items);
  }, [studioId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCourse(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/courses`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          direction: direction || undefined,
          level,
          kind,
          defaultDurationMin: duration,
          capacity
        })
      });
      setName('');
      setDirection('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать курс');
    }
  }

  async function toggleArchive(course: Course) {
    setError('');
    try {
      await api(`/studios/${studioId}/courses/${course.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !course.archived })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить курс');
    }
  }

  return (
    <section className="space-y-4">
      <form
        onSubmit={createCourse}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="block text-slate-600">Название курса</span>
          <input
            required
            minLength={2}
            maxLength={140}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Направление</span>
          <input
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Уровень</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {LEVELS.map((item) => (
              <option key={item} value={item}>
                {LEVEL_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Тип</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Длительность</span>
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {DURATIONS.map((item) => (
              <option key={item} value={item}>
                {item} мин
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Мест</span>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value))}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Добавить курс
        </button>
      </form>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Курс</th>
              <th className="px-4 py-2">Уровень</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2">Длит.</th>
              <th className="px-4 py-2">Мест</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium">{course.name}</div>
                  <div className="text-xs text-slate-500">{course.direction ?? '—'}</div>
                </td>
                <td className="px-4 py-2 text-slate-600">{LEVEL_LABELS[course.level]}</td>
                <td className="px-4 py-2 text-slate-600">{KIND_LABELS[course.kind]}</td>
                <td className="px-4 py-2 text-slate-600">{course.defaultDurationMin} мин</td>
                <td className="px-4 py-2 text-slate-600">{course.capacity}</td>
                <td className="px-4 py-2 text-right">
                  {course.archived && (
                    <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      архив
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleArchive(course)}
                    className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    {course.archived ? 'Вернуть' : 'В архив'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
