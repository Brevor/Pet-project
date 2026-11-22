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
  const email = `m3-${randomUUID()}@example.com`;
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

async function createStudio(token: string): Promise<{ id: string; membershipId: string }> {
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });
  assert.equal(response.statusCode, 201);
  const studio = response.json().studio;
  createdStudios.push(studio.id);
  return { id: studio.id, membershipId: '' };
}

test('создание студии: 201, 7 строк часов, роль владельца', { skip }, async () => {
  const { token } = await registerUser();
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  createdStudios.push(body.studio.id);
  assert.equal(body.workingHours.length, 7);
  assert.deepEqual(body.myRoles, ['owner']);
  assert.equal(body.studio.timezone, 'Europe/Moscow');
});

test('GET студии: владелец видит, посторонний получает 403 NOT_A_MEMBER', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const ok = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studio.id}`,
    headers: auth(owner.token)
  });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json().myRoles, ['owner']);

  const stranger = await registerUser();
  const denied = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studio.id}`,
    headers: auth(stranger.token)
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error.code, 'NOT_A_MEMBER');
});

test('PATCH студии меняет название и часы', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const response = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}`,
    headers: auth(owner.token),
    payload: {
      name: 'Dance Lab 2',
      workingHours: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        opensAt: '10:00',
        closesAt: '21:00',
        isClosed: index === 5
      }))
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.studio.name, 'Dance Lab 2');
  assert.equal(body.workingHours[0].opensAt, '10:00');
  assert.equal(body.workingHours[5].isClosed, true);
});

test('архивировать студию может только владелец', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const member = await registerUser();

  await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: member.email, roles: ['admin'] }
  });

  const denied = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/archive`,
    headers: auth(member.token)
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error.code, 'FORBIDDEN');

  const ok = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/archive`,
    headers: auth(owner.token)
  });
  assert.equal(ok.statusCode, 204);
});

test('добавление участников: 404 для неизвестного email, 409 при дубле', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const missing = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: 'nobody@example.com', roles: ['teacher'] }
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'USER_NOT_FOUND');

  const member = await registerUser();
  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: member.email, roles: ['teacher'] }
  });
  assert.equal(created.statusCode, 201);

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: member.email, roles: ['teacher'] }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'ALREADY_MEMBER');
});

test('несколько ролей у участника и фильтр списка', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const member = await registerUser();

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: member.email, roles: ['teacher', 'assistant'] }
  });
  const membershipId = created.json().membership.membershipId;

  const patched = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studio.id}/members/${membershipId}`,
    headers: auth(owner.token),
    payload: { roles: ['teacher', 'assistant', 'curator'] }
  });
  assert.equal(patched.statusCode, 200);
  assert.deepEqual(patched.json().membership.roles, ['assistant', 'curator', 'teacher']);

  const filtered = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studio.id}/members?role=curator`,
    headers: auth(owner.token)
  });
  assert.equal(filtered.statusCode, 200);
  assert.equal(filtered.json().items.length, 1);
  assert.equal(filtered.json().items[0].email, member.email);
});

test('владельца нельзя исключить — 409 LAST_OWNER', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);

  const list = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token)
  });
  const ownerMembership = list.json().items[0].membershipId;

  const response = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${studio.id}/members/${ownerMembership}`,
    headers: auth(owner.token)
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'LAST_OWNER');
});

test('передача владения: новый owner, прежний admin', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const member = await registerUser();

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: member.email, roles: ['teacher'] }
  });
  const memberMembership = created.json().membership.membershipId;

  const transfer = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/owner-transfer`,
    headers: auth(owner.token),
    payload: { membershipId: memberMembership }
  });
  assert.equal(transfer.statusCode, 204);

  const members = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token)
  });
  const rows = members.json().items;
  const newOwner = rows.find((row: { email: string }) => row.email === member.email);
  const oldOwner = rows.find((row: { email: string }) => row.email === owner.email);

  assert.ok(newOwner.roles.includes('owner'));
  assert.ok(!oldOwner.roles.includes('owner'));
  assert.ok(oldOwner.roles.includes('admin'));
});

test('ученик создаётся с временным паролем и может войти', { skip }, async () => {
  const owner = await registerUser();
  const studio = await createStudio(owner.token);
  const studentEmail = `m3-${randomUUID()}@example.com`;
  createdEmails.push(studentEmail);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studio.id}/members`,
    headers: auth(owner.token),
    payload: { email: studentEmail, roles: ['student'] }
  });

  assert.equal(created.statusCode, 201);
  const body = created.json();
  assert.equal(body.accountCreated, true);
  assert.ok(body.temporaryPassword);

  const login = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: studentEmail, password: body.temporaryPassword }
  });
  assert.equal(login.statusCode, 200);
});
