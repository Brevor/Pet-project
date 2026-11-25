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

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function registerUser(): Promise<{ token: string; email: string }> {
  const email = `grp-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'secret123' }
  });
  assert.equal(response.statusCode, 201);
  return { token: response.json().token, email };
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

async function createCourse(token: string, studioId: string): Promise<string> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: {
      name: `Курс ${randomUUID()}`,
      level: 'none',
      kind: 'group',
      defaultDurationMin: 60,
      capacity: 12
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().course.id as string;
}

async function addStudent(token: string, studioId: string): Promise<string> {
  const email = `std-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(token),
    payload: { email, roles: ['student'] }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().membership.membershipId as string;
}

test('группы: CRUD и состав (T-88)', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);
  const courseId = await createCourse(owner.token, studioId);
  const student = await addStudent(owner.token, studioId);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token),
    payload: { name: 'Пн/Ср' }
  });
  assert.equal(created.statusCode, 201, created.body);
  const groupId = created.json().group.id as string;

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token),
    payload: { name: 'пн/ср' }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'GROUP_NAME_TAKEN');

  const list = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token)
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().items.length, 1);

  const add = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}/members`,
    headers: auth(owner.token),
    payload: { membershipId: student }
  });
  assert.equal(add.statusCode, 204, add.body);

  const roster = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}/members`,
    headers: auth(owner.token)
  });
  assert.equal(roster.statusCode, 200, roster.body);
  assert.equal(roster.json().items.length, 1);
  assert.equal(roster.json().items[0].membershipId, student);

  const second = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token),
    payload: { name: 'Вт/Чт' }
  });
  const secondId = second.json().group.id as string;

  const conflict = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${secondId}/members`,
    headers: auth(owner.token),
    payload: { membershipId: student }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'ALREADY_IN_COURSE_GROUP');

  const teacher = await registerUser();
  const teacherRole = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token),
    payload: { email: teacher.email, roles: ['teacher'] }
  });
  assert.equal(teacherRole.statusCode, 201, teacherRole.body);

  const forbidden = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(teacher.token),
    payload: { name: 'Пт' }
  });
  assert.equal(forbidden.statusCode, 403);

  const removed = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}/members/${student}`,
    headers: auth(owner.token)
  });
  assert.equal(removed.statusCode, 204);

  const deleted = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}`,
    headers: auth(owner.token)
  });
  assert.equal(deleted.statusCode, 204);
});
