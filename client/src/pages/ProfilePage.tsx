import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Avatar } from '../components/Avatar';
import { Badge } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { InlineAlert } from '../ui/InlineAlert';

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

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_LIMIT = 2 * 1024 * 1024;

export function ProfilePage({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    const keys = Object.keys(patchValue);
    if (keys.length > 0) {
      setFieldErrors((current) => {
        const next = { ...current };
        for (const key of keys) delete next[key];
        return next;
      });
    }
  }

  function applyError(cause: unknown, fallback: string) {
    if (cause instanceof ApiError) {
      const fields = cause.fieldErrors;
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
      }
      if (Object.keys(fields).length === 0) {
        setError(cause.message || fallback);
      }
      return;
    }
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setFieldErrors({});
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
      applyError(cause, 'Не удалось сохранить профиль');
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
      applyError(cause, 'Не удалось изменить пароль');
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    setFieldErrors({});
    if (!AVATAR_TYPES.includes(file.type)) {
      setFieldErrors({ avatar: 'Нужен файл PNG, JPEG или WebP' });
      return;
    }
    if (file.size > AVATAR_LIMIT) {
      setFieldErrors({ avatar: 'Файл больше 2 МБ' });
      return;
    }
    try {
      await api('/me/avatar', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file
      });
      await load();
      setNotice('Аватар обновлён');
    } catch (cause) {
      applyError(cause, 'Не удалось загрузить аватар');
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
      applyError(cause, 'Не удалось удалить аватар');
    }
  }

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-4 p-4 md:p-5">
        <Avatar url={me?.user.avatarUrl} name={me?.user.displayName ?? 'Профиль'} size={64} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-lg font-semibold">{me?.user.displayName ?? 'Профиль'}</p>
          <p className="text-sm text-muted">
            {me?.user.email} <span className="text-faint">— используется для входа</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="btn btn-sm btn-secondary cursor-pointer">
              Загрузить аватар
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadAvatar}
                className="sr-only"
              />
            </label>
            {me?.user.avatarUrl && (
              <Button size="sm" variant="danger" onClick={() => void removeAvatar()}>
                Удалить аватар
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onLogout}>
              Выйти
            </Button>
          </div>
          {fieldErrors.avatar && (
            <p className="field-error" role="alert">
              {fieldErrors.avatar}
            </p>
          )}
        </div>
      </section>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {notice && <InlineAlert variant="success">{notice}</InlineAlert>}

      <form onSubmit={saveProfile} className="card space-y-4 p-4 md:p-5" noValidate>
        <h3 className="text-base font-semibold">Личные данные</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-first" label="Имя" required error={fieldErrors.firstName}>
            {(props) => (
              <input
                {...props}
                autoComplete="given-name"
                maxLength={80}
                value={form.firstName}
                onChange={(event) => patch({ firstName: event.target.value })}
              />
            )}
          </Field>
          <Field id="profile-last" label="Фамилия" required error={fieldErrors.lastName}>
            {(props) => (
              <input
                {...props}
                autoComplete="family-name"
                maxLength={80}
                value={form.lastName}
                onChange={(event) => patch({ lastName: event.target.value })}
              />
            )}
          </Field>
          <Field
            id="profile-phone"
            label="Телефон"
            hint="Цифры, +, пробелы, скобки и дефис"
            error={fieldErrors.phone}
          >
            {(props) => (
              <input
                {...props}
                type="tel"
                autoComplete="tel"
                placeholder="+7 916 123-45-67"
                maxLength={32}
                value={form.phone}
                onChange={(event) => patch({ phone: event.target.value })}
              />
            )}
          </Field>
          <Field
            id="profile-social"
            label="Ссылка на соцсеть"
            hint="Начинается с http:// или https://"
            error={fieldErrors.socialUrl}
          >
            {(props) => (
              <input
                {...props}
                type="url"
                autoComplete="url"
                placeholder="https://vk.com/anna"
                maxLength={200}
                value={form.socialUrl}
                onChange={(event) => patch({ socialUrl: event.target.value })}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="profile-messenger"
              label="Контакт в мессенджере"
              hint={`Свободный текст, ${100 - form.messengerContact.length} символов осталось`}
              error={fieldErrors.messengerContact}
            >
              {(props) => (
                <input
                  {...props}
                  placeholder="@anna или t.me/anna"
                  maxLength={100}
                  value={form.messengerContact}
                  onChange={(event) => patch({ messengerContact: event.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              id="profile-about"
              label="О себе"
              hint={`${form.about.length} / 500`}
              error={fieldErrors.about}
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={4}
                  maxLength={500}
                  value={form.about}
                  onChange={(event) => patch({ about: event.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
        <Button type="submit">Сохранить профиль</Button>
      </form>

      <section className="card space-y-2 p-4 md:p-5">
        <h3 className="text-base font-semibold">Студии и роли</h3>
        {me?.memberships.length === 0 && (
          <p className="text-sm text-muted">У аккаунта пока нет ни одной студии.</p>
        )}
        <ul className="space-y-2">
          {me?.memberships.map((membership) => (
            <li key={membership.studioId} className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{membership.studioName}</span>
              {membership.roles.map((role) => (
                <Badge key={role} tone="brand">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
        <p className="text-xs text-faint">
          Роли меняет владелец или администратор студии в разделе «Команда».
        </p>
      </section>

      <form onSubmit={changePassword} className="card space-y-4 p-4 md:p-5" noValidate>
        <h3 className="text-base font-semibold">Смена пароля</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="profile-current"
            label="Текущий пароль"
            error={fieldErrors.currentPassword ?? fieldErrors.password}
          >
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            )}
          </Field>
          <Field id="profile-new" label="Новый пароль" hint="От 8 символов" error={fieldErrors.newPassword}>
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit" variant="secondary">
          Изменить пароль
        </Button>
      </form>
    </div>
  );
}