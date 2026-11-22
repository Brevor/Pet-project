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

async function registerUser(prefix: string): Promise<{ token: string; email: string }> {
  const email = `${prefix}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const response = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'secret123', displayName: prefix }
  });
  assert.equal(response.statusCode, 201);
  return { token: response.json().token, email };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

test('сквозной сценарий §12: студия, персонал, залы, курсы, серия, конфликт', { skip }, async () => {
  const owner = await registerUser('owner');
  const studio = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(owner.token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });
  assert.equal(studio.statusCode, 201);
  const studioId = studio.json().studio.id as string;
  createdStudios.push(studioId);

  const teacher = await registerUser('teacher');
  const assistant = await registerUser('assistant');
  for (const [person, roles] of [
    [teacher, ['teacher']],
    [assistant, ['assistant']]
  ] as const) {
    const added = await requireApp().inject({
      method: 'POST',
      url: `/api/v1/studios/${studioId}/members`,
      headers: auth(owner.token),
      payload: { email: person.email, roles: [...roles] }
    });
    assert.equal(added.statusCode, 201);
  }

  const studentEmail = `student-${randomUUID()}@example.com`;
  createdEmails.push(studentEmail);
  const student = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token),
    payload: { email: studentEmail, roles: ['student'] }
  });
  assert.equal(student.statusCode, 201);
  const studentLogin = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: studentEmail, password: student.json().temporaryPassword }
  });
  assert.equal(studentLogin.statusCode, 200);

  const roomA = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(owner.token),
    payload: { name: 'Зал А', capacity: 25 }
  });
  const roomB = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(owner.token),
    payload: { name: 'Зал Б', capacity: 12 }
  });

  const course = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: {
      name: 'Hip-Hop · начинающие',
      direction: 'Hip-Hop',
      level: 'beginner',
      kind: 'group',
      defaultDurationMin: 90,
      capacity: 14
    }
  });
  assert.equal(course.statusCode, 201);

  const teacherMembership = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/members?role=teacher`,
    headers: auth(owner.token)
  });
  const teacherId = teacherMembership.json().items[0].membershipId as string;

  const series = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/sessions`,
    headers: auth(owner.token),
    payload: {
      courseId: course.json().course.id,
      roomId: roomA.json().room.id,
      teacherMembershipId: teacherId,
      series: {
        weekdays: [1, 3],
        startTime: '18:00',
        startsOn: '2027-02-01',
        until: '2027-02-14',
        durationMin: 90
      }
    }
  });
  assert.equal(series.statusCode, 201);
  assert.equal(series.json().created, 4);

  const conflict = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/sessions`,
    headers: auth(owner.token),
    payload: {
      courseId: course.json().course.id,
      roomId: roomA.json().room.id,
      teacherMembershipId: teacherId,
      startsAt: '2027-02-01T18:30:00+03:00',
      durationMin: 60
    }
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'ROOM_CONFLICT');

  const teacherSchedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/schedule?from=2027-02-01&to=2027-02-14`,
    headers: auth(teacher.token)
  });
  assert.equal(teacherSchedule.statusCode, 200);
  assert.equal(teacherSchedule.json().items.length, 4);

  const teacherAttempt = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/sessions`,
    headers: auth(teacher.token),
    payload: {
      courseId: course.json().course.id,
      roomId: roomB.json().room.id,
      teacherMembershipId: teacherId,
      startsAt: '2027-02-03T10:00:00+03:00',
      durationMin: 60
    }
  });
  assert.equal(teacherAttempt.statusCode, 403);

  const studentSchedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/schedule?from=2027-02-01&to=2027-02-14`,
    headers: auth(studentLogin.json().token)
  });
  assert.equal(studentSchedule.statusCode, 200);
  assert.equal(studentSchedule.json().items.length, 4);
});
