import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  COURSE_COLORS,
  KIND_LABELS,
  LEVEL_LABELS,
  courseColorHex,
  type Course,
  type Teacher
} from '../types';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'none'];
const KINDS = ['group', 'individual'];
const DURATIONS = [45, 60, 75, 90, 120];

interface CourseForm {
  name: string;
  direction: string;
  level: string;
  kind: string;
  duration: number;
  capacity: number;
  color: string;
  teacherMembershipId: string;
}

const emptyForm: CourseForm = {
  name: '',
  direction: '',
  level: 'beginner',
  kind: 'group',
  duration: 90,
  capacity: 12,
  color: 'violet',
  teacherMembershipId: ''
};

export function CoursesTab({ studioId, canManage }: { studioId: string; canManage: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CourseForm>(emptyForm);

  const load = useCallback(async () => {
    const [courseList, teacherList] = await Promise.all([
      api<{ items: Course[] }>(`/studios/${studioId}/courses?includeArchived=true`),
      api<{ items: Teacher[] }>(`/studios/${studioId}/teachers`)
    ]);
    setCourses(courseList.items);
    setTeachers(teacherList.items);
  }, [studioId]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить курсы')
    );
  }, [load]);

  function update(patch: Partial<CourseForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateEdit(patch: Partial<CourseForm>) {
    setEditForm((current) => ({ ...current, ...patch }));
  }

  function payloadOf(value: CourseForm) {
    return {
      name: value.name,
      direction: value.direction || undefined,
      level: value.level,
      kind: value.kind,
      defaultDurationMin: value.duration,
      capacity: value.capacity,
      color: value.color,
      teacherMembershipId: value.teacherMembershipId || null
    };
  }

  async function createCourse(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/courses`, {
        method: 'POST',
        body: JSON.stringify(payloadOf(form))
      });
      setForm(emptyForm);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать курс');
    }
  }

  function startEdit(course: Course) {
    setEditingId(course.id);
    setEditForm({
      name: course.name,
      direction: course.direction ?? '',
      level: course.level,
      kind: course.kind,
      duration: course.defaultDurationMin,
      capacity: course.capacity,
      color: course.color,
      teacherMembershipId: course.teacherMembershipId ?? ''
    });
    setError('');
  }

  async function saveEdit(event: React.FormEvent, courseId: string) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify(payloadOf(editForm))
      });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить курс');
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

  function teacherOptions(placeholder = 'не назначен') {
    return (
      <>
        <option value="">{placeholder}</option>
        {teachers.map((teacher) => (
          <option key={teacher.membershipId} value={teacher.membershipId}>
            {teacher.displayName}
          </option>
        ))}
      </>
    );
  }

  return (
    <section className="space-y-4">
      {canManage && (
        <form
          onSubmit={createCourse}
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="block text-slate-600">Название курса</span>
          <input
            required
            minLength={2}
            maxLength={140}
            value={form.name}
            onChange={(event) => update({ name: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Направление</span>
          <input
            value={form.direction}
            onChange={(event) => update({ direction: event.target.value })}
            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Уровень</span>
          <select
            value={form.level}
            onChange={(event) => update({ level: event.target.value })}
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
            value={form.kind}
            onChange={(event) => update({ kind: event.target.value })}
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
            value={form.duration}
            onChange={(event) => update({ duration: Number(event.target.value) })}
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
            value={form.capacity}
            onChange={(event) => update({ capacity: Number(event.target.value) })}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Цвет в календаре</span>
          <select
            value={form.color}
            onChange={(event) => update({ color: event.target.value })}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {COURSE_COLORS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600">Преподаватель</span>
          <select
            value={form.teacherMembershipId}
            onChange={(event) => update({ teacherMembershipId: event.target.value })}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
          >
            {teacherOptions()}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Добавить курс
        </button>
        </form>
      )}

      {error && <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Курс</th>
              <th className="px-4 py-2">Уровень</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2">Длит.</th>
              <th className="px-4 py-2">Мест</th>
              <th className="px-4 py-2">Преподаватель</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {courses.map((course) =>
              editingId === course.id ? (
                <tr key={course.id} className="border-t border-slate-100 bg-slate-50">
                  <td className="px-4 py-3" colSpan={7}>
                    <form onSubmit={(event) => saveEdit(event, course.id)} className="space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="min-w-[200px] flex-1 text-sm">
                          <span className="block text-slate-600">Название</span>
                          <input
                            required
                            minLength={2}
                            maxLength={140}
                            value={editForm.name}
                            onChange={(event) => updateEdit({ name: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="block text-slate-600">Направление</span>
                          <input
                            value={editForm.direction}
                            onChange={(event) => updateEdit({ direction: event.target.value })}
                            className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="block text-slate-600">Уровень</span>
                          <select
                            value={editForm.level}
                            onChange={(event) => updateEdit({ level: event.target.value })}
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
                            value={editForm.kind}
                            onChange={(event) => updateEdit({ kind: event.target.value })}
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
                            value={editForm.duration}
                            onChange={(event) => updateEdit({ duration: Number(event.target.value) })}
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
                            value={editForm.capacity}
                            onChange={(event) => updateEdit({ capacity: Number(event.target.value) })}
                            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="block text-slate-600">Цвет в календаре</span>
                          <select
                            value={editForm.color}
                            onChange={(event) => updateEdit({ color: event.target.value })}
                            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                          >
                            {COURSE_COLORS.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="block text-slate-600">Преподаватель</span>
                          <select
                            value={editForm.teacherMembershipId}
                            onChange={(event) =>
                              updateEdit({ teacherMembershipId: event.target.value })
                            }
                            className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                          >
                            {teacherOptions()}
                          </select>
                        </label>
                      </div>
                      <p className="text-xs text-slate-500">
                        Смена длительности не изменяет уже созданные сеансы.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
                        >
                          Отмена
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={course.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: courseColorHex(course.color) }}
                        title={course.color}
                      />
                      <span className="font-medium">{course.name}</span>
                    </div>
                    <div className="text-xs text-slate-500">{course.direction ?? '—'}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{LEVEL_LABELS[course.level]}</td>
                  <td className="px-4 py-2 text-slate-600">{KIND_LABELS[course.kind]}</td>
                  <td className="px-4 py-2 text-slate-600">{course.defaultDurationMin} мин</td>
                  <td className="px-4 py-2 text-slate-600">{course.capacity}</td>
                  <td className="px-4 py-2 text-slate-600">{course.teacherName ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {canManage && (
                      <>
                        {course.archived && (
                          <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                            архив
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(course)}
                          className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleArchive(course)}
                          className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          {course.archived ? 'Вернуть' : 'В архив'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
