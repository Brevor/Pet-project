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
  const email = `att-${randomUUID()}@example.com`;
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

async function createRoom(token: string, studioId: string): Promise<string> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(token),
    payload: { name: `Зал ${randomUUID().slice(0, 8)}`, capacity: 20 }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().room.id as string;
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
  assert.equal(response.statusCode, 201, response.body);
  return response.json().membership.membershipId as string;
}

async function topUp(
  token: string,
  studioId: string,
  membershipId: string,
  lessons: number
): Promise<void> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/students/${membershipId}/balance/topups`,
    headers: auth(token),
    payload: { lessons }
  });
  assert.equal(response.statusCode, 201, response.body);
}
async function createGroup(token: string, studioId: string, courseId: string): Promise<string> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(token),
    payload: { name: `Пн/Ср ${randomUUID().slice(0, 8)}` }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().group.id as string;
}

async function addToGroup(
  token: string,
  studioId: string,
  courseId: string,
  groupId: string,
  membershipId: string
): Promise<void> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}/members`,
    headers: auth(token),
    payload: { membershipId }
  });
  assert.equal(response.statusCode, 204, response.body);
}

interface Person {
  token: string;
  membershipId: string;
  email: string;
}

interface Fixture {
  studioId: string;
  ownerToken: string;
  courseId: string;
  roomId: string;
  teacher: Person;
  groupId: string;
  student: Person;
}

async function setup(): Promise<Fixture> {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);
  const courseId = await createCourse(owner.token, studioId);
  const roomId = await createRoom(owner.token, studioId);

  const teacher = await registerUser();
  const teacherMembershipId = await addMember(owner.token, studioId, teacher.email, ['teacher']);

  const student = await registerUser();
  const studentMembershipId = await addMember(owner.token, studioId, student.email, ['student']);

  const groupId = await createGroup(owner.token, studioId, courseId);
  await addToGroup(owner.token, studioId, courseId, groupId, studentMembershipId);
  await topUp(owner.token, studioId, studentMembershipId, 100);

  return {
    studioId,
    ownerToken: owner.token,
    courseId,
    roomId,
    teacher: { token: teacher.token, membershipId: teacherMembershipId, email: teacher.email },
    groupId,
    student: { token: student.token, membershipId: studentMembershipId, email: student.email }
  };
}

async function addStudent(fixture: Fixture): Promise<Person> {
  const user = await registerUser();
  const membershipId = await addMember(fixture.ownerToken, fixture.studioId, user.email, ['student']);
  await topUp(fixture.ownerToken, fixture.studioId, membershipId, 100);
  return { token: user.token, membershipId, email: user.email };
}

async function addRosterStudent(fixture: Fixture): Promise<Person> {
  const student = await addStudent(fixture);
  await addToGroup(
    fixture.ownerToken,
    fixture.studioId,
    fixture.courseId,
    fixture.groupId,
    student.membershipId
  );
  return student;
}

async function insertSession(
  fixture: Fixture,
  offsetMinutes: number,
  durationMin = 60
): Promise<string> {
  assert.ok(pool);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO class_sessions (studio_id, course_id, room_id, teacher_membership_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5), now() + make_interval(mins => $5 + $6))
     RETURNING id`,
    [fixture.studioId, fixture.courseId, fixture.roomId, fixture.teacher.membershipId, offsetMinutes, durationMin]
  );
  return rows[0]!.id;
}

function attendanceUrl(studioId: string, sessionId: string): string {
  return `/api/v1/studios/${studioId}/sessions/${sessionId}/attendance`;
}

function historyUrl(studioId: string, membershipId: string, query = ''): string {
  return `/api/v1/studios/${studioId}/students/${membershipId}/attendance${query}`;
}

test('посещаемость: самоотметка в окне и история ученика (T-89)', { skip }, async () => {
  const fixture = await setup();
  const sessionId = await insertSession(fixture, -5);

  const marked = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.student.token)
  });
  assert.equal(marked.statusCode, 201, marked.body);
  assert.equal(marked.json().attendance.status, 'attended');
  assert.equal(marked.json().attendance.membershipId, fixture.student.membershipId);
  assert.equal(marked.json().attendance.sessionId, sessionId);

  const again = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.student.token)
  });
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error.code, 'ALREADY_MARKED');

  const roster = await requireApp().inject({
    method: 'GET',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.student.token)
  });
  assert.equal(roster.statusCode, 200, roster.body);
  assert.equal(roster.json().items.length, 1);
  assert.equal(roster.json().items[0].membershipId, fixture.student.membershipId);
  assert.equal(roster.json().items[0].status, 'attended');

  const history = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(history.statusCode, 200, history.body);
  const page = history.json();
  assert.equal(page.total, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].sessionId, sessionId);
  assert.equal(page.items[0].status, 'attended');
  assert.ok(page.items[0].courseName);
  assert.ok(page.items[0].roomName);
  assert.ok(page.items[0].teacherName);
  assert.equal(page.items[0].revisions, undefined);

  const stranger = await addStudent(fixture);
  const foreign = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, stranger.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(foreign.statusCode, 403);
});

test('посещаемость: окна самоотметки, ростер и отмена (T-89)', { skip }, async () => {
  const fixture = await setup();
  const future = await insertSession(fixture, 180);
  const old = await insertSession(fixture, -130);
  const started = await insertSession(fixture, -5);

  const early = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, future),
    headers: auth(fixture.student.token)
  });
  assert.equal(early.statusCode, 409);
  assert.equal(early.json().error.code, 'CHECKIN_WINDOW_CLOSED');

  const late = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, old),
    headers: auth(fixture.student.token)
  });
  assert.equal(late.statusCode, 409);
  assert.equal(late.json().error.code, 'CHECKIN_WINDOW_CLOSED');

  const cancelled = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, future),
    headers: auth(fixture.student.token),
    payload: { status: 'cancelled' }
  });
  assert.equal(cancelled.statusCode, 201, cancelled.body);
  assert.equal(cancelled.json().attendance.status, 'cancelled');

  const repeat = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, future),
    headers: auth(fixture.student.token),
    payload: { status: 'cancelled' }
  });
  assert.equal(repeat.statusCode, 409);
  assert.equal(repeat.json().error.code, 'ALREADY_MARKED');

  const noShow = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, future),
    headers: auth(fixture.student.token),
    payload: { status: 'no_show' }
  });
  assert.equal(noShow.statusCode, 403);

  const stranger = await addStudent(fixture);
  const notInRoster = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, started),
    headers: auth(stranger.token)
  });
  assert.equal(notInRoster.statusCode, 403);
  assert.equal(notInRoster.json().error.code, 'NOT_IN_ROSTER');

  const second = await addRosterStudent(fixture);
  const cancelAfterStart = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, started),
    headers: auth(second.token),
    payload: { status: 'cancelled' }
  });
  assert.equal(cancelAfterStart.statusCode, 409);
  assert.equal(cancelAfterStart.json().error.code, 'CANCEL_WINDOW_CLOSED');

  const selfOnly = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, started),
    headers: auth(second.token),
    payload: { membershipId: fixture.student.membershipId }
  });
  assert.equal(selfOnly.statusCode, 403);
});

test('посещаемость: отметки администратора, аудит и права (T-89)', { skip }, async () => {
  const fixture = await setup();
  const sessionId = await insertSession(fixture, -60);

  const created = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: fixture.student.membershipId, status: 'no_show' }
  });
  assert.equal(created.statusCode, 201, created.body);
  const attendanceId = created.json().attendance.attendanceId as string;
  assert.equal(created.json().attendance.status, 'no_show');

  const teacherAttempt = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.teacher.token),
    payload: { membershipId: fixture.student.membershipId }
  });
  assert.equal(teacherAttempt.statusCode, 403);

  const studentPatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.student.token),
    payload: { status: 'attended' }
  });
  assert.equal(studentPatch.statusCode, 403);

  const patched = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended', reason: 'пришёл' }
  });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().attendance.status, 'attended');
  assert.equal(patched.json().attendance.membershipId, fixture.student.membershipId);

  assert.ok(pool);
  const revisions = await pool.query<{ from_status: string; to_status: string; reason: string | null }>(
    `SELECT from_status, to_status, reason FROM attendance_revisions WHERE attendance_id = $1`,
    [attendanceId]
  );
  assert.equal(revisions.rowCount, 1);
  assert.equal(revisions.rows[0]!.from_status, 'no_show');
  assert.equal(revisions.rows[0]!.to_status, 'attended');
  assert.equal(revisions.rows[0]!.reason, 'пришёл');

  const sameStatus = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended' }
  });
  assert.equal(sameStatus.statusCode, 200);
  const afterSame = await pool.query(`SELECT 1 FROM attendance_revisions WHERE attendance_id = $1`, [
    attendanceId
  ]);
  assert.equal(afterSame.rowCount, 1);

  const guest = await addStudent(fixture);
  const guestMarked = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: guest.membershipId, status: 'attended' }
  });
  assert.equal(guestMarked.statusCode, 201, guestMarked.body);

  const adminRoster = await requireApp().inject({
    method: 'GET',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(adminRoster.statusCode, 200);
  assert.equal(adminRoster.json().items.length, 2);
  const guestItem = adminRoster.json().items.find((item: { membershipId: string }) => item.membershipId === guest.membershipId);
  assert.equal(guestItem?.status, 'attended');

  const studentRoster = await requireApp().inject({
    method: 'GET',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.student.token)
  });
  assert.equal(studentRoster.statusCode, 200);
  assert.equal(studentRoster.json().items.length, 1);
  assert.equal(studentRoster.json().items[0].membershipId, fixture.student.membershipId);

  const curator = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, curator.email, ['curator']);
  const curatorPatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(curator.token),
    payload: { status: 'no_show' }
  });
  assert.equal(curatorPatch.statusCode, 403);

  const curatorHistory = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(curator.token)
  });
  assert.equal(curatorHistory.statusCode, 403);

  const cancelledSession = await insertSession(fixture, 240);
  await pool.query(`UPDATE class_sessions SET status = 'cancelled' WHERE id = $1`, [cancelledSession]);
  const onCancelled = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, cancelledSession),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: guest.membershipId }
  });
  assert.equal(onCancelled.statusCode, 409);
  assert.equal(onCancelled.json().error.code, 'SESSION_CANCELLED');

  const archived = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/archive`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(archived.statusCode, 204, archived.body);

  const onArchived = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, sessionId),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: guest.membershipId }
  });
  assert.equal(onArchived.statusCode, 403);
  assert.equal(onArchived.json().error.code, 'STUDIO_ARCHIVED');

  const patchArchived = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'no_show' }
  });
  assert.equal(patchArchived.statusCode, 403);
  assert.equal(patchArchived.json().error.code, 'STUDIO_ARCHIVED');
});

test('посещаемость: история, пагинация и границы студии (T-89)', { skip }, async () => {
  const fixture = await setup();
  const first = await insertSession(fixture, -60);
  const second = await insertSession(fixture, -200);

  for (const sessionId of [first, second]) {
    const response = await requireApp().inject({
      method: 'POST',
      url: attendanceUrl(fixture.studioId, sessionId),
      headers: auth(fixture.ownerToken),
      payload: { membershipId: fixture.student.membershipId, status: 'attended' }
    });
    assert.equal(response.statusCode, 201, response.body);
  }

  const pageOne = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, fixture.student.membershipId, '?page=1&perPage=1'),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(pageOne.statusCode, 200, pageOne.body);
  assert.equal(pageOne.json().total, 2);
  assert.equal(pageOne.json().items.length, 1);
  assert.equal(pageOne.json().items[0].sessionId, first);
  assert.deepEqual(pageOne.json().items[0].revisions, []);

  const pageTwo = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, fixture.student.membershipId, '?page=2&perPage=1'),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(pageTwo.statusCode, 200);
  assert.equal(pageTwo.json().items.length, 1);
  assert.equal(pageTwo.json().items[0].sessionId, second);

  const teacherSelf = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, fixture.teacher.membershipId),
    headers: auth(fixture.teacher.token)
  });
  assert.equal(teacherSelf.statusCode, 404);

  const unknown = await requireApp().inject({
    method: 'GET',
    url: historyUrl(fixture.studioId, randomUUID()),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(unknown.statusCode, 404);

  const ancient = await insertSession(fixture, -2 * 24 * 60);
  const beforeStudio = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, ancient),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: fixture.student.membershipId, status: 'attended' }
  });
  assert.equal(beforeStudio.statusCode, 422);
  assert.equal(beforeStudio.json().error.code, 'BEFORE_STUDIO_CREATED');
});
