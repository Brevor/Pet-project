import { Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">
          StudioFlow <span className="text-violet-600">— ядро студии</span>
        </h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Routes>
          <Route
            path="/"
            element={
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-semibold">Каркас клиента готов</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Дальше по плану: аутентификация, студия, персонал, залы, курсы и расписание.
                </p>
              </section>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
