import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Room } from '../types';

export function RoomsTab({ studioId }: { studioId: string }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(15);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState(1);
  const [editNote, setEditNote] = useState('');

  const load = useCallback(async () => {
    const data = await api<{ items: Room[] }>(`/studios/${studioId}/rooms?includeArchived=true`);
    setRooms(data.items);
  }, [studioId]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить залы')
    );
  }, [load]);

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/rooms`, {
        method: 'POST',
        body: JSON.stringify({ name, capacity, description: note || undefined })
      });
      setName('');
      setNote('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать зал');
    }
  }

  function startEdit(room: Room) {
    setEditingId(room.id);
    setEditName(room.name);
    setEditCapacity(room.capacity);
    setEditNote(room.description ?? '');
    setError('');
  }

  async function saveEdit(event: React.FormEvent, roomId: string) {
    event.preventDefault();
    setError('');
    try {
      await api(`/studios/${studioId}/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, capacity: editCapacity, description: editNote })
      });
      setEditingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить зал');
    }
  }

  async function toggleArchive(room: Room) {
    setError('');
    try {
      await api(`/studios/${studioId}/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !room.archived })
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить зал');
    }
  }

  async function removeRoom(room: Room) {
    if (!confirm(`Удалить зал «${room.name}»?`)) return;
    setError('');
    try {
      await api(`/studios/${studioId}/rooms/${room.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить зал');
    }
  }

  return (
    <section className="space-y-4">
      <form
        onSubmit={createRoom}
        className="flex flex-wrap items-end gap-3 card p-4"
      >
        <label className="text-sm">
          <span className="block text-muted">Название</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 rounded-lg border border-line-strong px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        <label className="text-sm">
          <span className="block text-muted">Мест</span>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value))}
            className="mt-1 w-24 rounded-lg border border-line-strong px-3 py-2"
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="block text-muted">Комментарий</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Добавить зал
        </button>
      </form>

      {error && <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {rooms.map((room) => (
          <article key={room.id} className="card p-4">
            {editingId === room.id ? (
              <form onSubmit={(event) => saveEdit(event, room.id)} className="space-y-2">
                <label className="block text-sm">
                  <span className="text-muted">Название</span>
                  <input
                    required
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Мест</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={editCapacity}
                    onChange={(event) => setEditCapacity(Number(event.target.value))}
                    className="mt-1 w-24 rounded-lg border border-line-strong px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Комментарий</span>
                  <input
                    value={editNote}
                    onChange={(event) => setEditNote(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                  />
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-muted hover:bg-subtle"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{room.name}</h3>
                    <p className="text-xs text-faint">{room.description ?? 'без описания'}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      room.archived ? 'bg-slate-200 text-muted' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {room.archived ? 'архив' : `${room.capacity} мест`}
                  </span>
                </div>
                <div className="mt-3 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => startEdit(room)}
                    className="rounded px-2 py-1 text-muted hover:bg-subtle"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleArchive(room)}
                    className="rounded px-2 py-1 text-muted hover:bg-subtle"
                  >
                    {room.archived ? 'Вернуть' : 'В архив'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoom(room)}
                    className="rounded px-2 py-1 text-danger hover:bg-danger-soft"
                  >
                    Удалить
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
