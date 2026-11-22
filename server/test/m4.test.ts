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

async function addMember(
  token: string,
  studioId: string,
  email: string,
  roles: string[]
): Promise<void> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(token),
    payload: { email, roles }
  });
  assert.equal(response.statusCode, 201, JSON.stringify(response.json()));
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

  const listed = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token)
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().items.length, 1);
  assert.equal(typeof listed.json().items[0].weeklyLoadHours, 'number');
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

  const found = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/courses?q=начин`,
    headers: auth(token)
  });
  assert.equal(found.statusCode, 200);
  assert.equal(found.json().items.length, 1);

  const notFound = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/courses?q=jazz`,
    headers: auth(token)
  });
  assert.equal(notFound.statusCode, 200);
  assert.equal(notFound.json().items.length, 0);

  const colored = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: { ...payload, name: 'Salsa · вечер', color: 'pink' }
  });
  assert.equal(colored.statusCode, 201);
  assert.equal(colored.json().course.color, 'pink');

  const recolored = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/courses/${colored.json().course.id}`,
    headers: auth(token),
    payload: { color: 'teal' }
  });
  assert.equal(recolored.statusCode, 200);
  assert.equal(recolored.json().course.color, 'teal');

  const badColor = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(token),
    payload: { ...payload, name: 'Bad color', color: '#ff00ff' }
  });
  assert.equal(badColor.statusCode, 422);
  assert.equal(badColor.json().error.code, 'VALIDATION');
  assert.ok(badColor.json().error.details.fields.color);
});

test('курс: преподаватель по умолчанию, teacherName и снятие через null', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);
  const teacher = await registerUser();
  await addMember(owner.token, studioId, teacher.email, ['teacher']);

  const members = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members?role=teacher`,
    headers: auth(owner.token)
  });
  assert.equal(members.statusCode, 200);
  const teacherMembershipId = members.json().items[0].membershipId as string;

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: {
      name: 'Hip-Hop · с преподавателем',
      level: 'beginner',
      kind: 'group',
      defaultDurationMin: 90,
      capacity: 14,
      teacherMembershipId
    }
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.json()));
  assert.equal(created.json().course.teacherMembershipId, teacherMembershipId);
  assert.equal(created.json().course.teacherName, 'Тест');

  const listed = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token)
  });
  assert.equal(listed.json().items[0].teacherMembershipId, teacherMembershipId);
  assert.equal(listed.json().items[0].teacherName, 'Тест');

  const cleared = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/courses/${created.json().course.id}`,
    headers: auth(owner.token),
    payload: { teacherMembershipId: null }
  });
  assert.equal(cleared.statusCode, 200, JSON.stringify(cleared.json()));
  assert.equal(cleared.json().course.teacherMembershipId, null);
  assert.equal(cleared.json().course.teacherName, null);
});

test('курс: не-преподаватель и членство чужой студии отклоняются', { skip }, async () => {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const assistant = await registerUser();
  await addMember(owner.token, studioId, assistant.email, ['assistant']);

  const members = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members?role=assistant`,
    headers: auth(owner.token)
  });
  assert.equal(members.statusCode, 200);
  const assistantMembershipId = members.json().items[0].membershipId as string;

  const basePayload = {
    name: 'Stretching',
    level: 'none',
    kind: 'group',
    defaultDurationMin: 60,
    capacity: 10
  };

  const notTeacher = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: { ...basePayload, teacherMembershipId: assistantMembershipId }
  });
  assert.equal(notTeacher.statusCode, 422);
  assert.equal(notTeacher.json().error.code, 'NOT_A_TEACHER');

  const otherOwner = await registerUser();
  const otherStudioId = await createStudio(otherOwner.token);
  const foreignTeacher = await registerUser();
  await addMember(otherOwner.token, otherStudioId, foreignTeacher.email, ['teacher']);
  const foreignMembers = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${otherStudioId}/members?role=teacher`,
    headers: auth(otherOwner.token)
  });
  const foreignTeacherId = foreignMembers.json().items[0].membershipId as string;

  const foreign = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: { ...basePayload, name: 'Йога', teacherMembershipId: foreignTeacherId }
  });
  assert.equal(foreign.statusCode, 422);
  assert.equal(foreign.json().error.code, 'NOT_A_TEACHER');

  const course = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: basePayload
  });
  assert.equal(course.statusCode, 201);

  const patched = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/courses/${course.json().course.id}`,
    headers: auth(owner.token),
    payload: { teacherMembershipId: assistantMembershipId }
  });
  assert.equal(patched.statusCode, 422);
  assert.equal(patched.json().error.code, 'NOT_A_TEACHER');
});
