import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { getToken, setToken } from './api';
import { AuthPage } from './pages/AuthPage';
import { JoinPage } from './pages/JoinPage';
import { ProfilePage } from './pages/ProfilePage';
import { StudioPage } from './pages/StudioPage';

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [view, setView] = useState<'studio' | 'profile'>('studio');

  function logout() {
    setToken(null);
    setAuthed(false);
    setView('studio');
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            StudioFlow <span className="text-violet-600">— ядро студии</span>
          </h1>
          {authed && (
            <nav className="flex gap-1">
              <button
                type="button"
                onClick={() => setView('studio')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  view === 'studio'
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Студия
              </button>
              <button
                type="button"
                onClick={() => setView('profile')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  view === 'profile'
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Профиль
              </button>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route
            path="*"
            element={
              authed ? (
                view === 'profile' ? (
                  <ProfilePage onLogout={logout} />
                ) : (
                  <StudioPage onLogout={logout} />
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
