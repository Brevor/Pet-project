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
  const email = `m4-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'secret123', displayName: 'Тест' }
  });
  assert.equal(response.statusCode, 201);
  return { token: response.json().token, email };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function createStudio(token: string): Promise<string> {
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });
  assert.equal(response.statusCode, 201);
  const id = response.json().studio.id as string;
  createdStudios.push(id);
  return id;
}

test('залы: создание, дубль имени, валидация вместимости', { skip }, async () => {
  const { token } = await registerUser();
  const studioId = await createStudio(token);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token),
    payload: { name: 'Зал А', capacity: 20 }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().room.name, 'Зал А');

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token),
    payload: { name: 'зал а', capacity: 10 }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'ROOM_NAME_TAKEN');

  const invalid = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token),
    payload: { name: 'Зал Б', capacity: 0 }
  });
  assert.equal(invalid.statusCode, 422);
});

test('залы: архивация и удаление свободного зала', { skip }, async () => {
  const { token } = await registerUser();
  const studioId = await createStudio(token);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token),
    payload: { name: 'Зал В', capacity: 12 }
  });
  const roomId = created.json().room.id;

  const archived = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/rooms/${roomId}`,
    headers: auth(token),
    payload: { archived: true }
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json().room.archived, true);

  const list = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token)
  });
  assert.equal(list.json().items.length, 0);

  const removed = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${studioId}/rooms/${roomId}`,
    headers: auth(token)
  });
  assert.equal(removed.statusCode, 204);
});

test('курсы: создание, 141 символ отклоняется, дубль имени', { skip }, async () => {
  const { token } = await registerUser();
  const studioId = await createStudio(token);

  const payload = {
    name: 'Hip-Hop · начинающие',
    direction: 'Hip-Hop',
    level: 'beginner',
    kind: 'group',
    defaultDurationMin: 90,
    capacity: 14
  };

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload
  });
  assert.equal(created.statusCode, 201);

  const tooLong = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: { ...payload, name: 'к'.repeat(141) }
  });
  assert.equal(tooLong.statusCode, 422);

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: { ...payload, name: 'hip-hop · начинающие' }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'COURSE_NAME_TAKEN');

  const longOk = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: { ...payload, name: 'к'.repeat(140) }
  });
  assert.equal(longOk.statusCode, 201);
});
