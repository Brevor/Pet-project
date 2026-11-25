import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ROLE_LABELS, type Member } from '../types';
import { Avatar } from '../components/Avatar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Card';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, TableSkeleton } from '../ui/States';
import { Table } from '../ui/Table';

interface MeResponse {
  user: { email: string };
  memberships: Array<{ studioId: string; roles: string[] }>;
}

const ALL_ROLES = Object.keys(ROLE_LABELS);

export function StaffTab({ studioId, canManage }: { studioId: string; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [list, me] = await Promise.all([
      api<{ items: Member[] }>(`/studios/${studioId}/members`),
      api<MeResponse>('/me')
    ]);
    setMembers(list.items.filter((member) => member.roles.some((role) => role !== 'student')));
    setCurrentEmail(me.user.email);
    const membership = me.memberships.find((item) => item.studioId === studioId);
    setIsOwner(membership?.roles.includes('owner') ?? false);
  }, [studioId]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить участников')
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function searchMember(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSelected(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const data = await api<{ items: Member[] }>(
        `/studios/${studioId}/members?${params.toString()}`
      );
      setSearchResults(data.items);
      if (data.items.length === 0) {
        setError('Участник не найден. Новые пользователи сначала регистрируются по ссылке студии');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось найти участника');
    }
  }

  function pickMember(member: Member) {
    setSelected(member);
    setSelectedRoles([...member.roles]);
    setError('');
  }

  function toggleSelectedRole(role: string) {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  async function saveSelectedRoles() {
    if (!selected) return;
    setError('');
    try {
      await api(`/studios/${studioId}/members/${selected.membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: selectedRoles })
      });
      setSelected(null);
      setSearchResults([]);
      setSearchTerm('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить роли');
    }
  }

  function toggleDraftRole(role: string) {
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  function startEdit(member: Member) {
    setEditingId(member.membershipId);
    setDraftRoles([...member.roles]);
    setError('');
  }

  async function saveRoles(event: React.FormEvent, membershipId: string) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/members/${membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: draftRoles })
      });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить роли');
    }
  }

  async function transferOwnership(member: Member) {
    if (!confirm(`Передать владение студией участнику ${member.email}?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/owner-transfer`, {
        method: 'POST',
        body: JSON.stringify({ membershipId: member.membershipId })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось передать владение');
    }
  }

  async function removeMember(member: Member) {
    if (!confirm(`Исключить ${member.email} из студии?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/members/${member.membershipId}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось исключить участника');
    }
  }

  const selectedIsOwner = selected?.roles.includes('owner') ?? false;
  const selectedIsSelf = selected?.email === currentEmail;

  return (
    <section className="card p-4 md:p-6">
      <h3 className="text-base font-semibold">Персонал</h3>

      {canManage && (
        <form onSubmit={searchMember} className="mt-4 space-y-3 rounded-md bg-subtle p-4">
          <div>
            <p className="text-sm font-medium">Назначить роли участнику</p>
            <p className="text-xs text-muted">
              Новые пользователи регистрируются по ссылке студии и получают роль «ученик»; новые
              ученики добавляются во вкладке «Ученики». Здесь выбирается участник и его роли.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor="staff-search" className="min-w-[240px] flex-1">
              <span className="label">Email или имя участника</span>
              <input
                id="staff-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="student@example.com"
                className="input"
              />
            </label>
            <Button type="submit">Найти</Button>
          </div>

          {searchResults.length > 0 && !selected && (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface text-sm">
              {searchResults.map((member) => (
                <li key={member.membershipId}>
                  <button
                    type="button"
                    onClick={() => pickMember(member)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-subtle"
                  >
                    <span className="flex items-center gap-2">
                      <Avatar
                        url={member.avatarUrl}
                        name={member.displayName ?? member.email ?? '?'}
                        size={22}
                      />
                      <span>
                        <span className="font-medium">{member.displayName ?? member.email}</span>
                        <span className="ml-2 text-xs text-faint">{member.email}</span>
                      </span>
                    </span>
                    <span className="text-xs text-faint">{member.roles.join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="space-y-2 rounded-md border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{selected.displayName ?? selected.email}</span>
                <span className="text-xs text-faint">{selected.email}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setSelected(null)}
                >
                  Отмена
                </Button>
              </div>

              {selectedIsOwner || selectedIsSelf ? (
                <p className="text-xs text-muted">
                  {selectedIsOwner
                    ? 'Роли владельца здесь не меняются: владение передаётся кнопкой «Передать владение» у участника в списке ниже.'
                    : 'Свои роли менять нельзя — попросите это сделать владельца или администратора.'}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {ALL_ROLES.filter((role) => role !== 'owner').map((role) => (
                      <label key={role} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(role)}
                          onChange={() => toggleSelectedRole(role)}
                          className="rounded border-line-strong"
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => void saveSelectedRoles()}>
                    Сохранить роли
                  </Button>
                </>
              )}
            </div>
          )}
        </form>
      )}

      {error && (
        <div className="mt-3">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}

      {loading ? (
        <TableSkeleton />
      ) : members.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Сотрудников пока нет"
            text="Участник получает роль сотрудника через поле «Назначить роли участнику» выше."
          />
        </div>
      ) : (
        <Table caption="Сотрудники студии" className="mt-4">
          <thead>
            <tr>
              <th className="table-th" scope="col">
                Участник
              </th>
              <th className="table-th" scope="col">
                Роли
              </th>
              <th className="table-th" scope="col">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.email === currentEmail;
              const canEdit = !isSelf && !member.roles.includes('owner');
              return (
                <tr key={member.membershipId} className="border-t border-line">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <Avatar url={member.avatarUrl} name={member.displayName ?? member.email ?? '?'} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">
                          {member.displayName ?? member.email}
                          {isSelf && <span className="ml-2 text-xs text-faint">(вы)</span>}
                        </div>
                        <div className="truncate text-xs text-faint">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    {editingId === member.membershipId ? (
                      <form
                        onSubmit={(event) => saveRoles(event, member.membershipId)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        {ALL_ROLES.filter((role) => role !== 'owner').map((role) => (
                          <label key={role} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={draftRoles.includes(role)}
                              onChange={() => toggleDraftRole(role)}
                            />
                            {ROLE_LABELS[role]}
                          </label>
                        ))}
                        <Button type="submit" size="sm">
                          Сохранить
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Отмена
                        </Button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {member.roles.map((role) => (
                          <Badge key={role} tone={role === 'owner' ? 'warning' : 'neutral'}>
                            {ROLE_LABELS[role] ?? role}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="table-td text-right">
                    {canManage && (
                      <div className="flex flex-wrap justify-end gap-1">
                        {canEdit && editingId !== member.membershipId && (
                          <Button size="sm" variant="ghost" onClick={() => startEdit(member)}>
                            Изменить роли
                          </Button>
                        )}
                        {isOwner && !member.roles.includes('owner') && (
                          <Button size="sm" variant="ghost" onClick={() => transferOwnership(member)}>
                            Передать владение
                          </Button>
                        )}
                        {canEdit && !member.roles.includes('owner') && (
                          <Button size="sm" variant="danger" onClick={() => removeMember(member)}>
                            Исключить
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </section>
  );
}