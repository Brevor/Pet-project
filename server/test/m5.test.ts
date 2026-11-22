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

async function addMember(
  token: string,
  studioId: string,
  email: string,
  roles: string[]
): Promise<string> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/members`,
    headers: auth(token),
    payload: { email, roles }
  });
  assert.equal(response.statusCode, 201, JSON.stringify(response.json()));
  return response.json().membership.membershipId as string;
}

const sessionDuration = (item: { startsAt: string; endsAt: string }): number =>
  (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000;

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
      startsAt: '2026-12-01T10:00:00+03:00'
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
      startsAt: '2026-12-01T23:00:00+03:00'
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
    startsAt: '2026-12-02T10:00:00+03:00'
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
  const roomDetails = roomConflict.json().error.details;
  assert.ok(roomDetails.conflictingSessionId);
  assert.ok(roomDetails.startsAt);
  assert.ok(roomDetails.endsAt);

  const teacherConflict = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: { ...base, roomId: fixture.room2Id, startsAt: '2026-12-02T10:30:00+03:00' }
  });
  assert.equal(teacherConflict.statusCode, 409);
  assert.equal(teacherConflict.json().error.code, 'TEACHER_CONFLICT');
  assert.ok(teacherConflict.json().error.details.conflictingSessionId);
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
        until: '2027-01-17'
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

  const missing = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${fixture.studioId}/series/${seriesId}`,
    headers: auth(token)
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
});

test('границы периода считаются в часовом поясе студии', { skip }, async () => {
  const { fixture, token } = await setup();

  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    opensAt: '00:00',
    closesAt: '23:59',
    isClosed: false
  }));
  const patched = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}`,
    headers: auth(token),
    payload: { workingHours: hours }
  });
  assert.equal(patched.statusCode, 200, JSON.stringify(patched.json()));

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2027-02-02T01:00:00+03:00'
    }
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.json()));

  const sameDay = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2027-02-02&to=2027-02-02`,
    headers: auth(token)
  });
  assert.equal(sameDay.statusCode, 200);
  assert.equal(sameDay.json().items.length, 1);

  const previousDay = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2027-02-01&to=2027-02-01`,
    headers: auth(token)
  });
  assert.equal(previousDay.statusCode, 200);
  assert.equal(previousDay.json().items.length, 0);
});

test('отменённый сеанс освобождает слот', { skip }, async () => {
  const { fixture, token } = await setup();
  const payload = {
    courseId: fixture.courseId,
    roomId: fixture.roomId,
    teacherMembershipId: fixture.teacherId,
    startsAt: '2026-12-03T12:00:00+03:00'
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
      startsAt: '2026-12-04T10:00:00+03:00'
    }
  });

  const response = await requireApp().inject({
    method: 'DELETE',
    url: `/api/v1/studios/${fixture.studioId}/rooms/${fixture.roomId}`,
    headers: auth(token)
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'ROOM_IN_USE');
  assert.equal(response.json().error.details.sessionCount, 1);
});

test('длительность берётся из курса, durationMin запрещён', { skip }, async () => {
  const { fixture, token } = await setup();

  const withDuration = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-07T10:00:00+03:00',
      durationMin: 60
    }
  });
  assert.equal(withDuration.statusCode, 422);
  assert.equal(withDuration.json().error.code, 'VALIDATION');
  assert.ok(withDuration.json().error.details.fields.durationMin);

  const withSeriesDuration = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      series: {
        weekdays: [1],
        startTime: '18:00',
        startsOn: '2026-12-07',
        until: '2026-12-13',
        durationMin: 90
      }
    }
  });
  assert.equal(withSeriesDuration.statusCode, 422);
  assert.ok(withSeriesDuration.json().error.details.fields['series.durationMin']);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-07T10:00:00+03:00'
    }
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.json()));

  const schedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2026-12-07&to=2026-12-13`,
    headers: auth(token)
  });
  const item = schedule.json().items[0];
  assert.ok(item.sessionId);
  assert.equal(item.id, undefined);
  assert.equal(sessionDuration(item), 90);
});

test('преподаватель берётся из курса и переопределяется', { skip }, async () => {
  const { fixture, token } = await setup();

  const coursePatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/courses/${fixture.courseId}`,
    headers: auth(token),
    payload: { teacherMembershipId: fixture.teacherId }
  });
  assert.equal(coursePatch.statusCode, 200);

  const byDefault = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      startsAt: '2026-12-09T10:00:00+03:00'
    }
  });
  assert.equal(byDefault.statusCode, 201, JSON.stringify(byDefault.json()));

  const schedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2026-12-09&to=2026-12-09`,
    headers: auth(token)
  });
  assert.equal(schedule.json().items[0].teacherMembershipId, fixture.teacherId);
  assert.equal(schedule.json().items[0].teacherName, 'Тест');

  const second = await registerUser();
  const secondTeacherId = await addMember(token, fixture.studioId, second.email, ['teacher']);
  const overridden = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: secondTeacherId,
      startsAt: '2026-12-09T12:00:00+03:00'
    }
  });
  assert.equal(overridden.statusCode, 201);

  const afterOverride = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2026-12-09&to=2026-12-09`,
    headers: auth(token)
  });
  const overriddenItem = afterOverride
    .json()
    .items.find((row: { teacherMembershipId: string }) => row.teacherMembershipId === secondTeacherId);
  assert.ok(overriddenItem);

  const courseWithoutTeacher = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/courses`,
    headers: auth(token),
    payload: {
      name: 'Без преподавателя',
      level: 'none',
      kind: 'group',
      defaultDurationMin: 60,
      capacity: 10
    }
  });
  const missing = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: courseWithoutTeacher.json().course.id,
      roomId: fixture.roomId,
      startsAt: '2026-12-09T15:00:00+03:00'
    }
  });
  assert.equal(missing.statusCode, 422);
  assert.equal(missing.json().error.code, 'VALIDATION');
  assert.ok(missing.json().error.details.fields.teacherMembershipId);

  const assistant = await registerUser();
  const assistantId = await addMember(token, fixture.studioId, assistant.email, ['assistant']);
  const notTeacher = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: assistantId,
      startsAt: '2026-12-09T17:00:00+03:00'
    }
  });
  assert.equal(notTeacher.statusCode, 422);
  assert.equal(notTeacher.json().error.code, 'NOT_A_TEACHER');
});

test('перенос сохраняет длительность, смена курса не переписывает сеансы', { skip }, async () => {
  const { fixture, token } = await setup();

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-14T10:00:00+03:00'
    }
  });
  assert.equal(created.statusCode, 201);
  const sessionId = created.json().items[0].sessionId as string;

  const forbiddenPatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}`,
    headers: auth(token),
    payload: { durationMin: 120 }
  });
  assert.equal(forbiddenPatch.statusCode, 422);
  assert.ok(forbiddenPatch.json().error.details.fields.durationMin);

  const moved = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}`,
    headers: auth(token),
    payload: { startsAt: '2026-12-14T12:00:00+03:00' }
  });
  assert.equal(moved.statusCode, 200, JSON.stringify(moved.json()));
  assert.equal(sessionDuration(moved.json().session), 90);

  const courseUpdate = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/courses/${fixture.courseId}`,
    headers: auth(token),
    payload: { defaultDurationMin: 120 }
  });
  assert.equal(courseUpdate.statusCode, 200);

  const afterCourseChange = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions`,
    headers: auth(token),
    payload: {
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      teacherMembershipId: fixture.teacherId,
      startsAt: '2026-12-14T15:00:00+03:00'
    }
  });
  assert.equal(afterCourseChange.statusCode, 201);
  const newSessionId = afterCourseChange.json().items[0].sessionId as string;

  const schedule = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/schedule?from=2026-12-14&to=2026-12-14`,
    headers: auth(token)
  });
  const items = schedule.json().items as Array<{ sessionId: string; startsAt: string; endsAt: string }>;
  const oldSession = items.find((item) => item.sessionId === sessionId);
  const newSession = items.find((item) => item.sessionId === newSessionId);
  assert.ok(oldSession);
  assert.ok(newSession);
  assert.equal(sessionDuration(oldSession), 90);
  assert.equal(sessionDuration(newSession), 120);
});
