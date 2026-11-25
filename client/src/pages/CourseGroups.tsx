import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Course, Group, GroupMember, Member } from '../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Card';
import { EmptyState } from '../ui/States';
import { InlineAlert } from '../ui/InlineAlert';

export function CourseGroups({
  studioId,
  courses,
  students
}: {
  studioId: string;
  courses: Course[];
  students: Member[];
}) {
  const [courseId, setCourseId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courseId, courses]);

  const loadGroups = useCallback(async () => {
    if (!courseId) return;
    const data = await api<{ items: Group[] }>(
      `/studios/${studioId}/courses/${courseId}/groups`
    );
    setGroups(data.items);
    setSelectedGroupId((current) =>
      current && data.items.some((group) => group.id === current)
        ? current
        : (data.items[0]?.id ?? null)
    );
  }, [studioId, courseId]);

  useEffect(() => {
    setError('');
    void loadGroups().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить группы')
    );
  }, [loadGroups]);

  const loadMembers = useCallback(async () => {
    if (!courseId || !selectedGroupId) {
      setMembers([]);
      return;
    }
    const data = await api<{ items: GroupMember[] }>(
      `/studios/${studioId}/courses/${courseId}/groups/${selectedGroupId}/members`
    );
    setMembers(data.items);
  }, [studioId, courseId, selectedGroupId]);

  useEffect(() => {
    void loadMembers().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить состав группы')
    );
  }, [loadMembers]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const available = students.filter(
    (student) => !members.some((member) => member.membershipId === student.membershipId)
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'ALREADY_IN_COURSE_GROUP'
          ? 'Ученик уже состоит в группе этого курса'
          : cause instanceof Error
            ? cause.message
            : 'Не удалось выполнить действие'
      );
    } finally {
      setBusy(false);
    }
  }

  function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !courseId) return;
    void run(async () => {
      await api(`/studios/${studioId}/courses/${courseId}/groups`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      setName('');
      await loadGroups();
    });
  }

  function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!studentId || !selectedGroupId) return;
    void run(async () => {
      await api(
        `/studios/${studioId}/courses/${courseId}/groups/${selectedGroupId}/members`,
        { method: 'POST', body: JSON.stringify({ membershipId: studentId }) }
      );
      setStudentId('');
      await Promise.all([loadGroups(), loadMembers()]);
    });
  }

  function removeMember(membershipId: string) {
    if (!selectedGroupId) return;
    void run(async () => {
      await api(
        `/studios/${studioId}/courses/${courseId}/groups/${selectedGroupId}/members/${membershipId}`,
        { method: 'DELETE' }
      );
      await Promise.all([loadGroups(), loadMembers()]);
    });
  }

  function toggleArchive(group: Group) {
    void run(async () => {
      await api(`/studios/${studioId}/courses/${courseId}/groups/${group.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !group.archived })
      });
      await loadGroups();
    });
  }

  function removeGroup(group: Group) {
    if (!confirm(`Удалить группу «${group.name}»? Состав будет потерян.`)) return;
    void run(async () => {
      await api(`/studios/${studioId}/courses/${courseId}/groups/${group.id}`, {
        method: 'DELETE'
      });
      await loadGroups();
    });
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <section className="card p-4 md:p-6">
      <h3 className="text-base font-semibold">Группы курса</h3>
      <p className="mt-1 text-sm text-muted">
        Ростер сеанса — ученики групп курса. Ученик может быть только в одной группе каждого курса.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="label">Курс</span>
          <select
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setSelectedGroupId(null);
            }}
            className="input min-w-[220px]"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
                {course.archived ? ' (архив)' : ''}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={createGroup} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="label">Новая группа</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={80}
              placeholder="Пн/Ср"
              className="input min-w-[180px]"
            />
          </label>
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            Создать группу
          </Button>
        </form>
      </div>

      {error && (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Группы</h4>
          {groups.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="Групп пока нет" text="Создайте группу, чтобы собрать ростер." />
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {groups.map((group) => (
                <li
                  key={group.id}
                  className={`rounded-md border p-2 ${
                    group.id === selectedGroupId ? 'border-brand bg-brand-soft' : 'border-line'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      aria-pressed={group.id === selectedGroupId}
                      className="text-left text-sm font-medium text-ink"
                    >
                      {group.name}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{group.memberCount}</Badge>
                      {group.archived && <Badge tone="warning">архив</Badge>}
                      <button
                        type="button"
                        onClick={() => toggleArchive(group)}
                        disabled={busy}
                        className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-subtle"
                      >
                        {group.archived ? 'Вернуть' : 'В архив'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGroup(group)}
                        disabled={busy}
                        className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-soft"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold">Состав группы</h4>
          {!selectedGroup ? (
            <div className="mt-2">
              <EmptyState title="Группа не выбрана" text="Выберите группу слева." />
            </div>
          ) : (
            <>
              <form onSubmit={addMember} className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="label">Добавить ученика</span>
                  <select
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    className="input min-w-[220px]"
                  >
                    <option value="">— выберите —</option>
                    {available.map((student) => (
                      <option key={student.membershipId} value={student.membershipId}>
                        {student.displayName ?? student.email ?? student.membershipId}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary" disabled={busy || !studentId}>
                  Добавить
                </Button>
              </form>

              {members.length === 0 ? (
                <p className="mt-3 text-sm text-muted">В группе пока никого нет.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                  {members.map((member) => (
                    <li
                      key={member.membershipId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-ink">{member.displayName}</span>
                      <button
                        type="button"
                        onClick={() => removeMember(member.membershipId)}
                        disabled={busy}
                        className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-soft"
                      >
                        Убрать
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
