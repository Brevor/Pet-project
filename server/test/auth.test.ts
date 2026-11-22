import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { buildApp } from '../src/app';

const databaseUrl = process.env.DATABASE_URL;
const skip = databaseUrl ? false : 'DATABASE_URL не задан';

const createdEmails: string[] = [];
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;

function email(): string {
  const value = `authtest-${randomUUID()}@example.com`;
  createdEmails.push(value);
  return value;
}

after(async () => {
  if (!pool) return;
  if (createdEmails.length > 0) {
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
  }
  await pool.end();
});

function appWithDb() {
  assert.ok(pool);
  return buildApp({ pool, jwtSecret: 'test-secret', jwtExpiresIn: '1h' });
}

test('регистрация возвращает 201, токен и пользователя', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail, password: 'secret123', displayName: 'Анна' }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.ok(body.token);
  assert.equal(body.user.email, mail);
  assert.equal(body.user.displayName, 'Анна');
  assert.equal(body.user.password_hash, undefined);

  await app.close();
});

test('повторная регистрация того же email — 409 EMAIL_TAKEN', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail.toUpperCase(), password: 'secret123' }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'EMAIL_TAKEN');

  await app.close();
});

test('короткий пароль отклоняется с 422', { skip }, async () => {
  const app = appWithDb();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: email(), password: 'short' }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'VALIDATION');

  await app.close();
});

test('вход с верным паролем возвращает токен', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: mail, password: 'secret123' }
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().token);

  await app.close();
});

test('вход с неверным паролем — 401 INVALID_CREDENTIALS', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: mail, password: 'wrong-password' }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'INVALID_CREDENTIALS');

  await app.close();
});

test('GET /me с токеном возвращает пользователя и пустые членства', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail, password: 'secret123' }
  });
  const { token } = registered.json();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.user.email, mail);
  assert.deepEqual(body.memberships, []);

  await app.close();
});

test('GET /me без токена — 401', { skip }, async () => {
  const app = appWithDb();

  const response = await app.inject({ method: 'GET', url: '/api/v1/me' });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'UNAUTHORIZED');

  await app.close();
});

test('GET /me с испорченным токеном — 401', { skip }, async () => {
  const app = appWithDb();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: { authorization: 'Bearer not-a-token' }
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});


test('PATCH /me сохраняет профиль и запрещает email', { skip }, async () => {
  const app = appWithDb();
  const mail = email();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail, password: 'secret123' }
  });
  const token = registered.json().token;
  const auth = { authorization: `Bearer ${token}` };

  const saved = await app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: auth,
    payload: {
      firstName: 'Анна',
      lastName: 'Ковалёва',
      phone: '+7 (916) 123-45-67',
      socialUrl: 'https://vk.com/anna',
      messengerContact: '@anna',
      about: 'Первая строка\nВторая строка'
    }
  });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.json()));
  assert.equal(saved.json().user.displayName, 'Анна Ковалёва');
  assert.equal(saved.json().user.phone, '+7 (916) 123-45-67');
  assert.equal(saved.json().user.about, 'Первая строка\nВторая строка');

  const emptyName = await app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: auth,
    payload: { firstName: '', lastName: 'Ковалёва' }
  });
  assert.equal(emptyName.statusCode, 422);
  assert.ok(emptyName.json().error.details.fields.firstName);

  const badPhone = await app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: auth,
    payload: { firstName: 'Анна', lastName: 'Ковалёва', phone: 'abc' }
  });
  assert.equal(badPhone.statusCode, 422);
  assert.ok(badPhone.json().error.details.fields.phone);

  const emailAttempt = await app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: auth,
    payload: { firstName: 'Анна', lastName: 'Ковалёва', email: 'other@example.com' }
  });
  assert.equal(emailAttempt.statusCode, 422);
  assert.ok(emailAttempt.json().error.details.fields.email);

  await app.close();
});

test('POST /me/password меняет пароль', { skip }, async () => {
  const app = appWithDb();
  const mail = email();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail, password: 'secret123' }
  });
  const token = registered.json().token;
  const auth = { authorization: `Bearer ${token}` };

  const wrong = await app.inject({
    method: 'POST',
    url: '/api/v1/me/password',
    headers: auth,
    payload: { currentPassword: 'nope', newPassword: 'secret1234' }
  });
  assert.equal(wrong.statusCode, 401);

  const short = await app.inject({
    method: 'POST',
    url: '/api/v1/me/password',
    headers: auth,
    payload: { currentPassword: 'secret123', newPassword: 'short' }
  });
  assert.equal(short.statusCode, 422);

  const changed = await app.inject({
    method: 'POST',
    url: '/api/v1/me/password',
    headers: auth,
    payload: { currentPassword: 'secret123', newPassword: 'secret1234' }
  });
  assert.equal(changed.statusCode, 204);

  const relogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: mail, password: 'secret1234' }
  });
  assert.equal(relogin.statusCode, 200);

  await app.close();
});

test('аватар: загрузка, отдача и удаление', { skip }, async () => {
  const app = appWithDb();
  const mail = email();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: mail, password: 'secret123' }
  });
  const token = registered.json().token;
  const auth = { authorization: `Bearer ${token}` };

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/me/avatar',
    headers: { ...auth, 'content-type': 'image/png' },
    payload: png
  });
  assert.equal(uploaded.statusCode, 200, JSON.stringify(uploaded.json()));
  const avatarUrl = uploaded.json().user.avatarUrl as string;
  assert.ok(avatarUrl.startsWith('/api/v1/avatars/'));

  const served = await app.inject({ method: 'GET', url: avatarUrl });
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['content-type'], 'image/png');

  const bad = await app.inject({
    method: 'POST',
    url: '/api/v1/me/avatar',
    headers: { ...auth, 'content-type': 'application/pdf' },
    payload: Buffer.from('%PDF-1.4')
  });
  assert.ok([415, 422].includes(bad.statusCode));

  const removed = await app.inject({ method: 'DELETE', url: '/api/v1/me/avatar', headers: auth });
  assert.equal(removed.statusCode, 204);
  const gone = await app.inject({ method: 'GET', url: avatarUrl });
  assert.equal(gone.statusCode, 404);

  await app.close();
});