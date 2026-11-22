import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface ProfileUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  socialUrl: string | null;
  messengerContact: string | null;
  about: string | null;
  avatarUrl: string | null;
}

interface ProfileMembership {
  studioId: string;
  studioName: string;
  roles: string[];
  status: string;
}

interface MeResponse {
  user: ProfileUser;
  memberships: ProfileMembership[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  curator: 'Куратор',
  teacher: 'Преподаватель',
  assistant: 'Ассистент',
  student: 'Ученик'
};

function initials(user: ProfileUser | null): string {
  const first = user?.firstName?.[0] ?? user?.displayName?.[0] ?? '';
  const last = user?.lastName?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function ProfilePage({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    socialUrl: '',
    messengerContact: '',
    about: ''
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    const data = await api<MeResponse>('/me');
    setMe(data);
    setForm({
      firstName: data.user.firstName ?? '',
      lastName: data.user.lastName ?? '',
      phone: data.user.phone ?? '',
      socialUrl: data.user.socialUrl ?? '',
      messengerContact: data.user.messengerContact ?? '',
      about: data.user.about ?? ''
    });
  }, []);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить профиль')
    );
  }, [load]);

  function patch(patchValue: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patchValue }));
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || null,
          socialUrl: form.socialUrl || null,
          messengerContact: form.messengerContact || null,
          about: form.about || null
        })
      });
      await load();
      setNotice('Профиль сохранён');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль');
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Пароль изменён');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить пароль');
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      await api('/me/avatar', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file
      });
      await load();
      setNotice('Аватар обновлён');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить аватар');
    } finally {
      event.target.value = '';
    }
  }

  async function removeAvatar() {
    setError('');
    setNotice('');
    try {
      await api('/me/avatar', { method: 'DELETE' });
      await load();
      setNotice('Аватар удалён');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить аватар');
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
        {me?.user.avatarUrl ? (
          <img
            src={me.user.avatarUrl}
            alt="Аватар"
            className="h-16 w-16 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-lg font-semibold text-violet-700">
            {initials(me?.user ?? null)}
          </div>
        )}
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{me?.user.displayName ?? 'Профиль'}</p>
          <p className="text-slate-500">{me?.user.email} — используется для входа</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              Загрузить аватар
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadAvatar}
                className="hidden"
              />
            </label>
            {me?.user.avatarUrl && (
              <button
                type="button"
                onClick={() => void removeAvatar()}
                className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
              >
                Удалить аватар
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}

      <form
        onSubmit={saveProfile}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
      >
        <h3 className="font-semibold">Личные данные</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate-600">Имя *</span>
            <input
              value={form.firstName}
              onChange={(event) => patch({ firstName: event.target.value })}
              required
              maxLength={80}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Фамилия *</span>
            <input
              value={form.lastName}
              onChange={(event) => patch({ lastName: event.target.value })}
              required
              maxLength={80}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Телефон</span>
            <input
              value={form.phone}
              onChange={(event) => patch({ phone: event.target.value })}
              placeholder="+7 916 123-45-67"
              maxLength={32}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Ссылка на соцсеть</span>
            <input
              value={form.socialUrl}
              onChange={(event) => patch({ socialUrl: event.target.value })}
              placeholder="https://vk.com/anna"
              maxLength={200}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-slate-600">Контакт в мессенджере</span>
            <input
              value={form.messengerContact}
              onChange={(event) => patch({ messengerContact: event.target.value })}
              placeholder="@anna"
              maxLength={100}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-slate-600">О себе</span>
            <textarea
              value={form.about}
              onChange={(event) => patch({ about: event.target.value })}
              maxLength={500}
              rows={4}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
            <span className="text-xs text-slate-400">{form.about.length} / 500</span>
          </label>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Сохранить профиль
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h3 className="font-semibold">Студии и роли</h3>
        {me?.memberships.length === 0 && (
          <p className="mt-2 text-slate-500">У аккаунта пока нет ни одной студии.</p>
        )}
        <ul className="mt-2 space-y-1">
          {me?.memberships.map((membership) => (
            <li key={membership.studioId} className="flex flex-wrap gap-2 text-slate-600">
              <span className="font-medium">{membership.studioName}</span>
              <span>{membership.roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Роли меняет владелец или администратор студии в разделе «Команда».
        </p>
      </div>

      <form
        onSubmit={changePassword}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
      >
        <h3 className="font-semibold">Смена пароля</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate-600">Текущий пароль</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Новый пароль (от 8 символов)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Изменить пароль
        </button>
      </form>
    </section>
  );
}
