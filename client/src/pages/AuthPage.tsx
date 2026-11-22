import { useState } from 'react';
import { api, setToken } from '../api';

interface AuthResponse {
  token: string;
  user: { id: string; email: string; displayName: string | null };
}

export function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login' ? { email, password } : { email, password, displayName: displayName || undefined };
      const result = await api<AuthResponse>(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setToken(result.token);
      onAuth();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить запрос');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === 'login' ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Вход
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === 'register' ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Регистрация
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>

        {mode === 'register' && (
          <label className="block text-sm">
            <span className="text-slate-600">Имя</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="text-slate-600">Пароль</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
          />
        </label>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>
    </section>
  );
}
