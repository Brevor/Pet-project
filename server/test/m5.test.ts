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
  const email = `m5-${randomUUID()}@example.com`;
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

interface Fixture {
  studioId: string;
  roomId: string;
  room2Id: string;
  courseId: string;
  teacherId: string;
}

async function setup(): Promise<{ fixture: Fixture; token: string }> {
  const owner = await registerUser();
  const studio = await requireApp().inject({
    method: 'POST',
    url: '/api/v1/studios',
    headers: auth(owner.token),
    payload: { name: 'Dance Lab', timezone: 'Europe/Moscow' }
  });
  const studioId = studio.json().studio.id as string;
  createdStudios.push(studioId);

  const room = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(owner.token),
    payload: { name: 'Зал А', capacity: 20 }
  });
  const room2 = await requireApp().inject({
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
      name: 'Hip-Hop',
      level: 'beginner',
      kind: 'group',
      defaultDurationMin: 90,
      capacity: 14
    }
  });

  const teacher = await registerUser();
  const membership = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(owner.token),
    payload: { email: teacher.email, roles: ['teacher'] }
  });

  return {
    token: owner.token,
    fixture: {
      studioId,
      roomId: room.json().room.id,
      room2Id: room2.json().room.id,
      courseId: course.json().course.id,
      teacherId: membership.json().membership.membershipId
    }
  };
}

test('сеанс создаётся в рабочие часы', { skip }, async () => {
  const { fixture, token } = await setup();

  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-01T10:00:00+03:00',
      durationMin: 60
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().created, 1);
});

test('сеанс вне рабочих часов отклоняется', { skip }, async () => {
  const { fixture, token } = await setup();

  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-01T23:00:00+03:00',
      durationMin: 60
    }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'OUTSIDE_WORKING_HOURS');
});

test('конфликт по залу и по преподавателю', { skip }, async () => {
  const { fixture, token } = await setup();
  const base = {
    courseId: fixture.courseId,
    roomId: fixture.roomId,
    teacherMembershipId: fixture.teacherId,
    startsAt: '2026-12-02T10:00:00+03:00',
    durationMin: 90
  };

  const first = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: base
  });
  assert.equal(first.statusCode, 201);

  const roomConflict = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: { ...base, startsAt: '2026-12-02T10:30:00+03:00' }
  });
  assert.equal(roomConflict.statusCode, 409);
  assert.equal(roomConflict.json().error.code, 'ROOM_CONFLICT');

  const teacherConflict = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: { ...base, roomId: fixture.room2Id, startsAt: '2026-12-02T10:30:00+03:00' }
  });
  assert.equal(teacherConflict.statusCode, 409);
  assert.equal(teacherConflict.json().error.code, 'TEACHER_CONFLICT');
});

test('серия создаёт сеансы и отдаётся в расписании', { skip }, async () => {
  const { fixture, token } = await setup();

  const series = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      series: {
        weekdays: [1, 3],
        startTime: '18:00',
        startsOn: '2027-01-04',
        until: '2027-01-17',
        durationMin: 90
      }
    }
  });

  assert.equal(series.statusCode, 201);
  assert.equal(series.json().created, 4);
  const seriesId = series.json().seriesId as string;

  const schedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2027-01-04&to=2027-01-17`,
    headers: auth(token)
  });
  assert.equal(schedule.statusCode, 200);
  assert.equal(schedule.json().items.length, 4);

  const deleted = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${fixture.studioId}/series/${seriesId}`,
    headers: auth(token)
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json().deleted, 4);
});

test('отменённый сеанс освобождает слот', { skip }, async () => {
  const { fixture, token } = await setup();
  const payload = {
    courseId: fixture.courseId,
    roomId: fixture.roomId,
    teacherMembershipId: fixture.teacherId,
    startsAt: '2026-12-03T12:00:00+03:00',
    durationMin: 60
  };

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload
  });
  const sessionId = created.json().items[0].sessionId as string;

  await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/cancel`,
    headers: auth(token)
  });

  const again = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload
  });
  assert.equal(again.statusCode, 201);
});

test('зал с занятиями удалить нельзя', { skip }, async () => {
  const { fixture, token } = await setup();

  await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-04T10:00:00+03:00',
      durationMin: 60
    }
  });

  const response = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${fixture.studioId}/rooms/${fixture.roomId}`,
    headers: auth(token)
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'ROOM_IN_USE');
});
