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
  const email = `iso-${randomUUID()}@example.com`;
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

async function addMember(
  ownerToken: string,
  studioId: string,
  email: string,
  roles: string[]
): Promise<void> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(ownerToken),
    payload: { email, roles }
  });
  assert.equal(response.statusCode, 201, JSON.stringify(response.json()));
}

test('данные одной студии недоступны другой — 403 NOT_A_MEMBER', { skip }, async () => {
  const ownerA = await registerUser();
  const studioA = await createStudio(ownerA.token);

  const ownerB = await registerUser();
  const studioB = await createStudio(ownerB.token);

  await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioB}/rooms`,
    headers: auth(ownerB.token),
    payload: { name: 'Зал Б', capacity: 10 }
  });

  const foreign = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioB}/rooms`,
    headers: auth(ownerA.token)
  });
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.json().error.code, 'NOT_A_MEMBER');

  const own = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioA}/rooms`,
    headers: auth(ownerA.token)
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().items.length, 0);
});

test('все роли видят расписание, но не управляют им', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const teacher = await registerUser();
  const assistant = await registerUser();
  await addMember(owner.token, studioId, teacher.email, ['teacher']);
  await addMember(owner.token, studioId, assistant.email, ['assistant']);

  const from = '2026-12-01';
  const to = '2026-12-07';

  for (const token of [owner.token, teacher.token, assistant.token]) {
    const schedule = await requireApp().inject({
      method: 'GET',
      url: `/api/v1/studios/${studioId}/schedule?from=${from}&to=${to}`,
      headers: auth(token)
    });
    assert.equal(schedule.statusCode, 200);
  }

  const forbidden = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(teacher.token),
    payload: { name: 'Зал Т', capacity: 5 }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.json().error.code, 'FORBIDDEN');
});

test('ученик может смотреть расписание, но не персонал', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const studentEmail = `iso-${randomUUID()}@example.com`;
  createdEmails.push(studentEmail);
  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token),
    payload: { email: studentEmail, roles: ['student'] }
  });
  assert.equal(created.statusCode, 201);

  const login = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: studentEmail, password: created.json().temporaryPassword }
  });
  const studentToken = login.json().token as string;

  const schedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/schedule?from=2026-12-01&to=2026-12-07`,
    headers: auth(studentToken)
  });
  assert.equal(schedule.statusCode, 200);

  const members = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(studentToken)
  });
  assert.equal(members.statusCode, 403);
  assert.equal(members.json().error.code, 'FORBIDDEN');
});

test('запрос без токена — 401', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const response = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/schedule?from=2026-12-01&to=2026-12-07`
  });
  assert.equal(response.statusCode, 401);
});

test('куратор видит учеников, но не персонал; преподаватели доступны всем', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const curator = await registerUser();
  const teacher = await registerUser();
  const student = await registerUser();
  await addMember(owner.token, studioId, curator.email, ['curator']);
  await addMember(owner.token, studioId, teacher.email, ['teacher']);
  await addMember(owner.token, studioId, student.email, ['student']);

  const staff = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(curator.token)
  });
  assert.equal(staff.statusCode, 200);
  assert.ok(staff.json().items.length >= 2);
  assert.ok(staff.json().items.every((item: { email: string | null }) => item.email === null));

  const students = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members?role=student`,
    headers: auth(curator.token)
  });
  assert.equal(students.statusCode, 200);
  assert.equal(students.json().items.length, 1);
  assert.equal(students.json().items[0].email, null);

  const teachersForCurator = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/teachers`,
    headers: auth(curator.token)
  });
  assert.equal(teachersForCurator.statusCode, 200);
  assert.equal(teachersForCurator.json().items.length, 1);
  assert.equal(teachersForCurator.json().items[0].displayName, 'Тест');

  const teachersForStudent = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/teachers`,
    headers: auth(student.token)
  });
  assert.equal(teachersForStudent.statusCode, 200);
  assert.equal(teachersForStudent.json().items.length, 1);

  const fullStaff = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token)
  });
  assert.equal(fullStaff.statusCode, 200);
  assert.equal(fullStaff.json().items.length, 4);
});

test('«Команда» на просмотр: teacher видит сотрудников без email, student — нет', { skip }, async () => {
  const app = requireApp();
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);
  const teacher = await registerUser();
  const student = await registerUser();
  await addMember(owner.token, studioId, teacher.email, ['teacher']);
  await addMember(owner.token, studioId, student.email, ['student']);

  const teacherView = await app.inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(teacher.token)
  });
  assert.equal(teacherView.statusCode, 200);
  assert.ok(teacherView.json().items.length >= 2);
  assert.ok(teacherView.json().items.every((item: { email: string | null }) => item.email === null));

  const studentView = await app.inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(student.token)
  });
  assert.equal(studentView.statusCode, 403);
  assert.equal(studentView.json().error.code, 'FORBIDDEN');

  const ownerView = await app.inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token)
  });
  assert.equal(ownerView.statusCode, 200);
  assert.ok(ownerView.json().items.some((item: { email: string | null }) => item.email !== null));
});