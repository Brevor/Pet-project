import { useState } from 'react';
import { api, setToken } from '../api';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { InlineAlert } from '../ui/InlineAlert';

interface AuthResponse {
  token: string;
  user: { id: string; email: string; displayName: string | null };
}

export function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login'
          ? { email, password }
          : { email, password, displayName: displayName || undefined };
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
    <section className="card mx-auto max-w-md p-6">
      <div className="mb-5 flex gap-1.5" role="tablist" aria-label="Вход или регистрация">
        {(['login', 'register'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => {
              setMode(item);
              setError('');
            }}
            className={`btn btn-sm ${mode === item ? 'btn-primary' : 'btn-secondary'}`}
          >
            {item === 'login' ? 'Вход' : 'Регистрация'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Field id="auth-email" label="Email">
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        {mode === 'register' && (
          <Field id="auth-name" label="Имя" hint="Необязательно, можно заполнить позже в профиле">
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            )}
          </Field>
        )}

        <Field
          id="auth-password"
          label="Пароль"
          hint={mode === 'register' ? 'От 8 символов' : undefined}
        >
          {(props) => (
            <div className="relative">
              <input
                {...props}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${props.className} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-2 text-xs font-medium text-brand"
                aria-pressed={showPassword}
              >
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          )}
        </Field>

        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </Button>
      </form>
    </section>
  );
}