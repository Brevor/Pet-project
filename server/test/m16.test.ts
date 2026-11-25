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
  const email = `m16-${randomUUID()}@example.com`;
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

interface StudioFixture {
  studioId: string;
  ownerToken: string;
  courseId: string;
  roomId: string;
  studentMembershipId: string;
  studentToken: string;
  teacherToken: string;
}

async function setupStudio(withSession = true): Promise<StudioFixture & { sessionId: string }> {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const course = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses`,
    headers: auth(owner.token),
    payload: {
      name: `Курс ${randomUUID()}`,
      level: 'none',
      kind: 'group',
      defaultDurationMin: 60,
      capacity: 12
    }
  });
  assert.equal(course.statusCode, 201, course.body);
  const courseId = course.json().course.id as string;

  const room = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/rooms`,
    headers: auth(owner.token),
    payload: { name: `Зал ${randomUUID().slice(0, 6)}`, capacity: 10 }
  });
  assert.equal(room.statusCode, 201, room.body);
  const roomId = room.json().room.id as string;

  const teacher = await registerUser();
  const teacherMembershipId = await addMember(owner.token, studioId, teacher.email, ['teacher']);

  const student = await registerUser();
  const studentMembershipId = await addMember(owner.token, studioId, student.email, ['student']);

  const group = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token),
    payload: { name: `Группа ${randomUUID().slice(0, 6)}` }
  });
  assert.equal(group.statusCode, 201, group.body);
  const groupId = group.json().group.id as string;
  const added = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups/${groupId}/members`,
    headers: auth(owner.token),
    payload: { membershipId: studentMembershipId }
  });
  assert.equal(added.statusCode, 204, added.body);

  let sessionId = '';
  if (withSession) {
    assert.ok(pool);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO class_sessions (studio_id, course_id, room_id, teacher_membership_id, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, now() - interval '5 minutes', now() + interval '55 minutes')
       RETURNING id`,
      [studioId, courseId, roomId, teacherMembershipId]
    );
    sessionId = rows[0]!.id;
  }

  return {
    studioId,
    ownerToken: owner.token,
    courseId,
    roomId,
    studentMembershipId,
    studentToken: student.token,
    teacherToken: teacher.token,
    sessionId
  };
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

function attendanceUrl(studioId: string, sessionId: string): string {
  return `/api/v1/studios/${studioId}/sessions/${sessionId}/attendance`;
}

function balanceUrl(studioId: string, membershipId: string): string {
  return `/api/v1/studios/${studioId}/students/${membershipId}/balance`;
}

test('M16: данные новых сущностей чужой студии недоступны (T-94)', { skip }, async () => {
  const studioA = await setupStudio();
  const studioB = await setupStudio();

  await topUp(studioB.ownerToken, studioB.studioId, studioB.studentMembershipId, 5);
  const foreignMark = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(studioB.studioId, studioB.sessionId),
    headers: auth(studioB.studentToken)
  });
  assert.equal(foreignMark.statusCode, 201, foreignMark.body);
  const foreignAttendanceId = foreignMark.json().attendance.attendanceId as string;

  const foreignCatalog = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioB.studioId}/achievements`,
    headers: auth(studioB.ownerToken)
  });
  const foreignAchievementId = foreignCatalog.json().items[0].achievementId as string;

  const foreignGroup = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioB.studioId}/courses/${studioB.courseId}/groups`,
    headers: auth(studioB.ownerToken),
    payload: { name: 'Чужая группа' }
  });
  assert.equal(foreignGroup.statusCode, 201, foreignGroup.body);
  const foreignGroupId = foreignGroup.json().group.id as string;

  const crossStudio = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioA.studioId}/sessions/${studioB.sessionId}/attendance`,
    headers: auth(studioA.ownerToken)
  });
  assert.equal(crossStudio.statusCode, 404);

  const foreignSessionMark = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(studioA.studioId, studioB.sessionId),
    headers: auth(studioA.ownerToken),
    payload: { membershipId: studioA.studentMembershipId, status: 'attended' }
  });
  assert.equal(foreignSessionMark.statusCode, 404);

  const foreignAttendancePatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioA.studioId}/attendance/${foreignAttendanceId}`,
    headers: auth(studioA.ownerToken),
    payload: { status: 'no_show' }
  });
  assert.equal(foreignAttendancePatch.statusCode, 404);

  const foreignBalance = await requireApp().inject({
    method: 'GET',
    url: balanceUrl(studioA.studioId, studioB.studentMembershipId),
    headers: auth(studioA.ownerToken)
  });
  assert.equal(foreignBalance.statusCode, 404);

  const foreignTopup = await requireApp().inject({
    method: 'POST',
    url: `${balanceUrl(studioA.studioId, studioB.studentMembershipId)}/topups`,
    headers: auth(studioA.ownerToken),
    payload: { lessons: 3 }
  });
  assert.equal(foreignTopup.statusCode, 422);
  assert.equal(foreignTopup.json().error.code, 'NOT_A_STUDENT');

  const foreignAwards = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioA.studioId}/students/${studioB.studentMembershipId}/achievements`,
    headers: auth(studioA.ownerToken)
  });
  assert.equal(foreignAwards.statusCode, 404);

  const foreignAchievementPatch = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${studioA.studioId}/achievements/${foreignAchievementId}`,
    headers: auth(studioA.ownerToken),
    payload: { name: 'Переименовано' }
  });
  assert.equal(foreignAchievementPatch.statusCode, 404);

  const foreignRoster = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioA.studioId}/courses/${studioA.courseId}/groups/${foreignGroupId}/members`,
    headers: auth(studioA.ownerToken)
  });
  assert.equal(foreignRoster.statusCode, 404);

  const wrongMembership = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${studioA.studioId}/schedule?from=2026-12-01&to=2026-12-07`,
    headers: auth(studioB.ownerToken)
  });
  assert.equal(wrongMembership.statusCode, 403);
  assert.equal(wrongMembership.json().error.code, 'NOT_A_MEMBER');
});

test('M16: teacher, assistant и curator не ставят отметки и не начисляют (T-94)', { skip }, async () => {
  const fixture = await setupStudio();
  await topUp(fixture.ownerToken, fixture.studioId, fixture.studentMembershipId, 5);

  const marked = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, fixture.sessionId),
    headers: auth(fixture.ownerToken),
    payload: { membershipId: fixture.studentMembershipId, status: 'attended' }
  });
  assert.equal(marked.statusCode, 201, marked.body);
  const attendanceId = marked.json().attendance.attendanceId as string;

  const teacher = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, teacher.email, ['teacher']);
  const assistant = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, assistant.email, ['assistant']);
  const curator = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, curator.email, ['curator']);

  for (const token of [teacher.token, assistant.token, curator.token]) {
    const mark = await requireApp().inject({
      method: 'POST',
      url: attendanceUrl(fixture.studioId, fixture.sessionId),
      headers: auth(token),
      payload: { membershipId: fixture.studentMembershipId, status: 'no_show' }
    });
    assert.equal(mark.statusCode, 403);

    const patch = await requireApp().inject({
      method: 'PATCH',
      url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
      headers: auth(token),
      payload: { status: 'no_show' }
    });
    assert.equal(patch.statusCode, 403);

    const topup = await requireApp().inject({
      method: 'POST',
      url: `${balanceUrl(fixture.studioId, fixture.studentMembershipId)}/topups`,
      headers: auth(token),
      payload: { lessons: 2 }
    });
    assert.equal(topup.statusCode, 403);
  }

  const curatorBalance = await requireApp().inject({
    method: 'GET',
    url: balanceUrl(fixture.studioId, fixture.studentMembershipId),
    headers: auth(curator.token)
  });
  assert.equal(curatorBalance.statusCode, 200);
  assert.equal(curatorBalance.json().balance, 4);

  const teacherBalance = await requireApp().inject({
    method: 'GET',
    url: balanceUrl(fixture.studioId, fixture.studentMembershipId),
    headers: auth(teacher.token)
  });
  assert.equal(teacherBalance.statusCode, 403);

  const teacherAward = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/students/${fixture.studentMembershipId}/achievements`,
    headers: auth(teacher.token),
    payload: { achievementId: randomUUID() }
  });
  assert.equal(teacherAward.statusCode, 403);

  const curatorCatalog = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/achievements`,
    headers: auth(curator.token)
  });
  assert.equal(curatorCatalog.statusCode, 200);

  const teacherCatalog = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/achievements`,
    headers: auth(teacher.token)
  });
  assert.equal(teacherCatalog.statusCode, 200);

  const created = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/achievements`,
    headers: auth(curator.token),
    payload: { name: 'Кураторское достижение' }
  });
  assert.equal(created.statusCode, 201, created.body);
});

test('M16: откат транзакции отметки при нехватке занятий (T-94)', { skip }, async () => {
  const fixture = await setupStudio();

  const denied = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, fixture.sessionId),
    headers: auth(fixture.studentToken)
  });
  assert.equal(denied.statusCode, 409);
  assert.equal(denied.json().error.code, 'NO_LESSONS_LEFT');

  const roster = await requireApp().inject({
    method: 'GET',
    url: attendanceUrl(fixture.studioId, fixture.sessionId),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(roster.statusCode, 200);
  assert.equal(roster.json().items.length, 1);
  assert.equal(roster.json().items[0].status, null);

  const emptyBalance = await requireApp().inject({
    method: 'GET',
    url: balanceUrl(fixture.studioId, fixture.studentMembershipId),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(emptyBalance.json().balance, 0);

  const emptyOperations = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.studentMembershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(emptyOperations.json().total, 0);

  assert.ok(pool);
  const future = await pool.query<{ id: string }>(
    `INSERT INTO class_sessions (studio_id, course_id, room_id, teacher_membership_id, starts_at, ends_at)
     SELECT studio_id, course_id, room_id, teacher_membership_id, now() + interval '3 hours', now() + interval '4 hours'
       FROM class_sessions WHERE id = $1
     RETURNING id`,
    [fixture.sessionId]
  );
  const futureId = future.rows[0]!.id;


  const cancelled = await requireApp().inject({
    method: 'POST',
    url: attendanceUrl(fixture.studioId, futureId),
    headers: auth(fixture.studentToken),
    payload: { status: 'cancelled' }
  });
  assert.equal(cancelled.statusCode, 201, cancelled.body);
  const cancelledId = cancelled.json().attendance.attendanceId as string;

  const patchDenied = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${cancelledId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended' }
  });
  assert.equal(patchDenied.statusCode, 409);
  assert.equal(patchDenied.json().error.code, 'NO_LESSONS_LEFT');

  const unchanged = await requireApp().inject({
    method: 'GET',
    url: attendanceUrl(fixture.studioId, futureId),
    headers: auth(fixture.ownerToken)
  });
  const item = unchanged.json().items.find(
    (entry: { membershipId: string }) => entry.membershipId === fixture.studentMembershipId
  );
  assert.equal(item.status, 'cancelled');

  const revisions = await pool.query(
    'SELECT 1 FROM attendance_revisions WHERE attendance_id = $1',
    [cancelledId]
  );
  assert.equal(revisions.rowCount, 0);

  await topUp(fixture.ownerToken, fixture.studioId, fixture.studentMembershipId, 1);

  const patched = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${cancelledId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended' }
  });
  assert.equal(patched.statusCode, 200, patched.body);

  const after = await requireApp().inject({
    method: 'GET',
    url: balanceUrl(fixture.studioId, fixture.studentMembershipId),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(after.json().balance, 0);
});
