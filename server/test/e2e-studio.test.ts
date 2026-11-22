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

  // Шаг 3: смена кода ссылки — старый адрес перестаёт работать
  const oldCode = studio.json().referralCode as string;
  const changedLink = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/referral`,
    headers: auth(owner.token),
    payload: { code: `dance-${randomUUID().slice(0, 8)}` }
  });
  assert.equal(changedLink.statusCode, 200);
  const newCode = changedLink.json().referralCode as string;

  const oldLookup = await requireApp().inject({ method: 'GET', url: `/api/v1/join/${oldCode}` });
  assert.equal(oldLookup.statusCode, 404);
  assert.equal(oldLookup.json().error.code, 'REFERRAL_NOT_FOUND');

  const newLookup = await requireApp().inject({ method: 'GET', url: `/api/v1/join/${newCode}` });
  assert.equal(newLookup.statusCode, 200);

  // Шаг 2: регистрация ученика по ссылке — роль student и рабочий JWT
  const newcomerEmail = `join-${randomUUID()}@example.com`;
  createdEmails.push(newcomerEmail);
  const registered = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${newCode}/register`,
    payload: { email: newcomerEmail, password: 'secret123', displayName: 'Алиса' }
  });
  assert.equal(registered.statusCode, 201);
  assert.deepEqual(registered.json().membership.roles, ['student']);
  assert.ok(registered.json().token);

  // Шаг 5: авторизованный пользователь вступает по ссылке
  const joiner = await registerUser('joiner');
  const joined = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/join/${newCode}/join`,
    headers: auth(joiner.token)
  });
  assert.equal(joined.statusCode, 201);
  assert.deepEqual(joined.json().membership.roles, ['student']);

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

  const courseWithTeacher = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/courses/${course.json().course.id}`,
    headers: auth(owner.token),
    payload: { teacherMembershipId: teacherId }
  });
  assert.equal(courseWithTeacher.statusCode, 200);
  assert.equal(courseWithTeacher.json().course.teacherName, 'teacher');

  const rolesUpdate = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/members/${teacherId}`,
    headers: auth(owner.token),
    payload: { roles: ['teacher', 'curator'] }
  });
  assert.equal(rolesUpdate.statusCode, 200);
  assert.deepEqual(rolesUpdate.json().membership.roles, ['curator', 'teacher']);

  const rolesRestore = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/members/${teacherId}`,
    headers: auth(owner.token),
    payload: { roles: ['teacher'] }
  });
  assert.equal(rolesRestore.statusCode, 200);

  const series = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/sessions`,
    headers: auth(owner.token),
    payload: {
      courseId: course.json().course.id,
      roomId: roomA.json().room.id,
      series: {
        weekdays: [1, 3],
        startTime: '18:00',
        startsOn: '2027-02-01',
        until: '2027-02-14'
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
      startsAt: '2027-02-01T18:30:00+03:00'
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
      startsAt: '2027-02-03T10:00:00+03:00'
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

  const firstSession = teacherSchedule.json().items[0] as {
    sessionId: string;
    startsAt: string;
    endsAt: string;
  };
  const durationMinutes =
    (Date.parse(firstSession.endsAt) - Date.parse(firstSession.startsAt)) / 60_000;
  assert.equal(durationMinutes, 90);

  const durationPost = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/sessions`,
    headers: auth(owner.token),
    payload: {
      courseId: course.json().course.id,
      roomId: roomB.json().room.id,
      teacherMembershipId: teacherId,
      startsAt: '2027-02-05T10:00:00+03:00',
      durationMin: 60
    }
  });
  assert.equal(durationPost.statusCode, 422);
  assert.equal(durationPost.json().error.code, 'VALIDATION');
  assert.ok(durationPost.json().error.details.fields.durationMin);

  const durationPatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioId}/sessions/${firstSession.sessionId}`,
    headers: auth(owner.token),
    payload: { durationMin: 120 }
  });
  assert.equal(durationPatch.statusCode, 422);
  assert.ok(durationPatch.json().error.details.fields.durationMin);

  // Шаг 12: данные чужой студии недоступны
  const outsider = await registerUser('outsider');
  const outsiderStudio = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(outsider.token),
    payload: { name: 'Other Lab', timezone: 'Europe/Moscow' }
  });
  assert.equal(outsiderStudio.statusCode, 201);
  createdStudios.push(outsiderStudio.json().studio.id as string);

  const foreignSchedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioId}/schedule?from=2027-02-01&to=2027-02-14`,
    headers: auth(outsider.token)
  });
  assert.equal(foreignSchedule.statusCode, 403);
  assert.equal(foreignSchedule.json().error.code, 'NOT_A_MEMBER');

  const ownSchedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${outsiderStudio.json().studio.id}/schedule?from=2027-02-01&to=2027-02-14`,
    headers: auth(outsider.token)
  });
  assert.equal(ownSchedule.statusCode, 200);
  assert.equal(ownSchedule.json().items.length, 0);
});
