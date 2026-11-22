import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

const databaseUrl = process.env.DATABASE_URL;
const skip = databaseUrl ? false : 'DATABASE_URL не задан';

const createdEmails: string[] = [];
const createdStudios: string[] = [];
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
const app: FastifyInstance | undefined = pool
  ? buildApp({ pool, jwtSecret: 'test-secret', jwtExpiresIn: '1h' })
  : undefined;

after(async () => {
  if (!pool) return;
  if (createdStudios.length > 0) {
    await pool.query('DELETE FROM studios WHERE id = ANY($1)', [createdStudios]);
  }
  if (createdEmails.length > 0) {
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
  }
  await pool.end();
});

function requireApp(): FastifyInstance {
  assert.ok(app);
  return app;
}

async function registerUser(): Promise<{ token: string; email: string }> {
  const email = `join-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'secret123', displayName: 'Владелец' }
  });
  assert.equal(response.statusCode, 201);
  return { token: response.json().token, email };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function createStudio(token: string): Promise<{ id: string; referralCode: string }> {
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });
  assert.equal(response.statusCode, 201);
  const body = response.json();
  createdStudios.push(body.studio.id);
  return { id: body.studio.id, referralCode: body.referralCode };
}

test('создание студии возвращает реферальный код и ссылку', { skip }, async () => {
  const owner = await registerUser();
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(owner.token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  createdStudios.push(body.studio.id);
  assert.match(body.referralCode, /^[a-z0-9]{3,32}$/);
  assert.equal(body.referralUrl, `/join/${body.referralCode}`);

  const studio = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${body.studio.id}`,
    headers: auth(owner.token)
  });
  assert.equal(studio.json().referralCode, body.referralCode);
});

test('GET /join/{code}: известный код — 200, неизвестный — 404', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const ok = await requireApp().inject({ method: 'GET', url: `/api/v1/join/${studio.referralCode}` });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().studio.id, studio.id);

  const missing = await requireApp().inject({ method: 'GET', url: '/api/v1/join/unknown-code' });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'REFERRAL_NOT_FOUND');
});

test('регистрация по ссылке даёт роль «ученик» и рабочий JWT', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const email = `join-${randomUUID()}@example.com`;
  createdEmails.push(email);

  const registered = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${studio.referralCode}/register`,
    payload: { email, password: 'secret123', displayName: 'Ученик' }
  });

  assert.equal(registered.statusCode, 201);
  const body = registered.json();
  assert.deepEqual(body.membership.roles, ['student']);
  assert.ok(body.token);

  const me = await requireApp().inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: auth(body.token)
  });
  assert.equal(me.json().memberships[0].roles[0], 'student');

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${studio.referralCode}/register`,
    payload: { email, password: 'secret123' }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'EMAIL_TAKEN');
});

test('авторизованный пользователь присоединяется по ссылке, повтор — 409', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const guest = await registerUser();

  const joined = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${studio.referralCode}/join`,
    headers: auth(guest.token)
  });
  assert.equal(joined.statusCode, 201);
  assert.deepEqual(joined.json().membership.roles, ['student']);

  const again = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${studio.referralCode}/join`,
    headers: auth(guest.token)
  });
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error.code, 'ALREADY_MEMBER');
});

test('смена кода: старый адрес 404, новый работает', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const nextCode = 'dance-lab';

  const changed = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}/referral`,
    headers: auth(owner.token),
    payload: { code: nextCode }
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.json().referralCode, nextCode);

  const old = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/join/${studio.referralCode}`
  });
  assert.equal(old.statusCode, 404);

  const fresh = await requireApp().inject({ method: 'GET', url: `/api/v1/join/${nextCode}` });
  assert.equal(fresh.statusCode, 200);
});

test('валидация и права при смене кода', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const invalid = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}/referral`,
    headers: auth(owner.token),
    payload: { code: 'join' }
  });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.json().error.code, 'INVALID_REFERRAL');

  const short = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}/referral`,
    headers: auth(owner.token),
    payload: { code: 'ab' }
  });
  assert.equal(short.statusCode, 422);

  const teacher = await registerUser();
  const membership = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: teacher.email, roles: ['teacher'] }
  });
  assert.equal(membership.statusCode, 201);

  const forbidden = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}/referral`,
    headers: auth(teacher.token),
    payload: { code: 'teacher-code' }
  });
  assert.equal(forbidden.statusCode, 403);
});

test('занятый код отклоняется с 409', { skip }, async () => {
  const owner = await registerUser();
  const first = await createStudio(owner.token);
  const second = await createStudio(owner.token);

  const response = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${second.id}/referral`,
    headers: auth(owner.token),
    payload: { code: first.referralCode.toUpperCase() }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'REFERRAL_TAKEN');
});
