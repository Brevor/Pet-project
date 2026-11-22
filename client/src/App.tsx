import { useState } from 'react';
import { getToken, setToken } from './api';
import { AuthPage } from './pages/AuthPage';
import { StudioPage } from './pages/StudioPage';

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));

  function logout() {
    setToken(null);
    setAuthed(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">
          StudioFlow <span className="text-violet-600">— ядро студии</span>
        </h1>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {authed ? <StudioPage onLogout={logout} /> : <AuthPage onAuth={() => setAuthed(true)} />}
      </main>
    </div>
  );
}
