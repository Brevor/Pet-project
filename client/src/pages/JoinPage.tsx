import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getToken, setToken } from '../api';

interface JoinStudio {
  id: string;
  name: string;
  referralCode: string;
}

export function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [studio, setStudio] = useState<JoinStudio | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const authed = Boolean(getToken());

  useEffect(() => {
    api<{ studio: JoinStudio }>(`/join/${code}`)
      .then((result) => setStudio(result.studio))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Ссылка не найдена')
      );
  }, [code]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (authed) {
        await api(`/join/${code}/join`, { method: 'POST' });
        navigate('/');
        return;
      }

      if (mode === 'register') {
        const result = await api<{ token: string }>(`/join/${code}/register`, {
          method: 'POST',
          body: JSON.stringify({ email, password, displayName: displayName || undefined })
        });
        setToken(result.token);
        navigate('/');
        return;
      }

      const login = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(login.token);
      await api(`/join/${code}/join`, { method: 'POST' });
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось присоединиться');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md card p-6">
      <p className="text-xs uppercase tracking-wide text-violet-600">Приглашение в студию</p>
      <h2 className="mt-1 text-lg font-semibold">{studio?.name ?? 'Загрузка…'}</h2>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <form onSubmit={submit} className="mt-4 space-y-3">
        {!authed && mode === 'register' && (
          <label className="block text-sm">
            <span className="text-slate-600">Имя</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
            />
          </label>
        )}

        {!authed && (
          <>
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
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy
            ? 'Подождите…'
            : authed
              ? 'Присоединиться к студии'
              : mode === 'register'
                ? 'Зарегистрироваться и присоединиться'
                : 'Войти и присоединиться'}
        </button>
      </form>

      {!authed && (
        <button
          type="button"
          onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
          className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700"
        >
          {mode === 'register' ? 'У меня уже есть аккаунт' : 'Я новый ученик — зарегистрироваться'}
        </button>
      )}
    </section>
  );
}
