import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { api, ApiError, getToken, setToken } from './api';
import { Avatar } from './components/Avatar';
import { Button } from './ui/Button';
import { AuthPage } from './pages/AuthPage';
import { JoinPage } from './pages/JoinPage';
import { ProfilePage } from './pages/ProfilePage';
import { StudioPage } from './pages/StudioPage';

interface MeUser {
  displayName: string;
  avatarUrl: string | null;
}

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [view, setView] = useState<'studio' | 'profile'>('studio');
  const [me, setMe] = useState<MeUser | null>(null);

  useEffect(() => {
    if (!authed) {
      setMe(null);
      return;
    }
    let cancelled = false;
    api<{ user: MeUser }>('/me')
      .then((data) => {
        if (!cancelled) setMe(data.user);
      })
      .catch((cause) => {
        if (cancelled) return;
        setMe(null);
        if (cause instanceof ApiError && cause.status === 401) {
          setAuthed(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  function logout() {
    setToken(null);
    setAuthed(false);
    setView('studio');
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
          <h1 className="text-lg font-semibold">
            StudioFlow <span className="text-brand">— ядро студии</span>
          </h1>
          {authed && (
            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex gap-1" aria-label="Разделы приложения">
                <Button
                  size="sm"
                  variant={view === 'studio' ? 'primary' : 'secondary'}
                  aria-current={view === 'studio' ? 'page' : undefined}
                  onClick={() => setView('studio')}
                >
                  Студия
                </Button>
                <Button
                  size="sm"
                  variant={view === 'profile' ? 'primary' : 'secondary'}
                  aria-current={view === 'profile' ? 'page' : undefined}
                  onClick={() => setView('profile')}
                >
                  Профиль
                </Button>
              </nav>
              <div className="flex items-center gap-2 border-line pl-2 sm:border-l">
                {me && (
                  <>
                    <Avatar url={me.avatarUrl} name={me.displayName} size={28} />
                    <span className="hidden max-w-[160px] truncate text-sm font-medium sm:inline">
                      {me.displayName}
                    </span>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={logout}>
                  Выйти
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 md:py-8">
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route
            path="*"
            element={
              authed ? (
                view === 'profile' ? (
                  <ProfilePage onLogout={logout} />
                ) : (
                  <StudioPage />
                )
              ) : (
                <AuthPage onAuth={() => setAuthed(true)} />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}
