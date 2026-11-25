import { useState } from 'react';
import { api } from '../api';

export function OnboardingPage({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  async function createStudio(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/studios', { method: 'POST', body: JSON.stringify({ name, timezone }) });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать студию');
    } finally {
      setBusy(false);
    }
  }

  function extractCode(input: string): string {
    const match = /join\/([a-z0-9-]+)/i.exec(input);
    return (match?.[1] ?? input).trim().toLowerCase();
  }

  async function joinByCode(event: React.FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError('');
    try {
      await api(`/join/${extractCode(code)}/join`, { method: 'POST' });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось присоединиться');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h2 className="text-base font-semibold">С чего начнём?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Вы ещё не в студии. Создайте свою — или присоединитесь к существующей по ссылке.
        </p>
      </section>

      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h3 className="text-sm font-semibold">Создать студию</h3>
          <p className="mt-1 text-xs text-slate-500">Вы станете владельцем и получите ссылку для учеников.</p>
          <form onSubmit={createStudio} className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-600">Название</span>
              <input
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Часовой пояс</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Europe/Moscow">Europe/Moscow</option>
                <option value="Europe/Kaliningrad">Europe/Kaliningrad</option>
                <option value="Asia/Yekaterinburg">Asia/Yekaterinburg</option>
                <option value="Asia/Novosibirsk">Asia/Novosibirsk</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? 'Создаём…' : 'Создать студию'}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h3 className="text-sm font-semibold">Присоединиться по ссылке</h3>
          <p className="mt-1 text-xs text-slate-500">
            Вставьте ссылку студии или её код — например, <code>dance-lab</code>.
          </p>
          <form onSubmit={joinByCode} className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-600">Ссылка или код</span>
              <input
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="https://…/join/dance-lab"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
              />
            </label>
            <button
              type="submit"
              disabled={joining}
              className="w-full rounded-lg border border-violet-600 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {joining ? 'Присоединяемся…' : 'Присоединиться'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
