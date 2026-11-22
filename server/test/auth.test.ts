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
    url: '/auth/register',
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

  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
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
    url: '/auth/register',
    payload: { email: email(), password: 'short' }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'VALIDATION');

  await app.close();
});

test('вход с верным паролем возвращает токен', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: mail, password: 'secret123' }
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().token);

  await app.close();
});

test('вход с неверным паролем — 401 INVALID_CREDENTIALS', { skip }, async () => {
  const app = appWithDb();
  const mail = email();

  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: mail, password: 'secret123' } });
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
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
    url: '/auth/register',
    payload: { email: mail, password: 'secret123' }
  });
  const { token } = registered.json();

  const response = await app.inject({
    method: 'GET',
    url: '/me',
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

  const response = await app.inject({ method: 'GET', url: '/me' });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'UNAUTHORIZED');

  await app.close();
});

test('GET /me с испорченным токеном — 401', { skip }, async () => {
  const app = appWithDb();

  const response = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: 'Bearer not-a-token' }
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});
