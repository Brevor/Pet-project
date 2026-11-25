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
  const email = `bal-${randomUUID()}@example.com`;
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

  const group = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${studioId}/courses/${courseId}/groups`,
    headers: auth(owner.token),
    payload: { name: `Пн/Ср ${randomUUID().slice(0, 8)}` }
  });
  assert.equal(group.statusCode, 201, group.body);
  const groupId = group.json().group.id as string;
  await addToGroup(owner.token, studioId, courseId, groupId, studentMembershipId);

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

async function addStudent(fixture: Fixture): Promise<Person> {
  const user = await registerUser();
  const membershipId = await addMember(fixture.ownerToken, fixture.studioId, user.email, ['student']);
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

function balanceUrl(studioId: string, membershipId: string): string {
  return `/api/v1/studios/${studioId}/students/${membershipId}/balance`;
}

async function topUp(
  token: string,
  studioId: string,
  membershipId: string,
  lessons: number,
  extra: Record<string, unknown> = {}
): Promise<{ statusCode: number; body: string }> {
  const response = await requireApp().inject({
    method: 'POST',
    url: `${balanceUrl(studioId, membershipId)}/topups`,
    headers: auth(token),
    payload: { lessons, ...extra }
  });
  return { statusCode: response.statusCode, body: response.body };
}

async function readBalance(token: string, studioId: string, membershipId: string) {
  return requireApp().inject({
    method: 'GET',
    url: balanceUrl(studioId, membershipId),
    headers: auth(token)
  });
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

test('баланс: начисление пакета, остаток и история (T-90)', { skip }, async () => {
  const fixture = await setup();

  const initial = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(initial.statusCode, 200, initial.body);
  assert.equal(initial.json().balance, 0);

  const topup = await topUp(fixture.ownerToken, fixture.studioId, fixture.student.membershipId, 12, {
    comment: 'ноябрь',
    expiresInMonths: 1
  });
  assert.equal(topup.statusCode, 201, topup.body);
  const topupBody = JSON.parse(topup.body);
  assert.equal(topupBody.balance, 12);
  assert.equal(topupBody.operation.kind, 'topup');
  assert.equal(topupBody.operation.lessons, 12);
  assert.equal(topupBody.operation.comment, 'ноябрь');
  assert.match(topupBody.operation.expiresOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(topupBody.operation.createdByName);

  const after = await readBalance(fixture.ownerToken, fixture.studioId, fixture.student.membershipId);
  assert.equal(after.json().balance, 12);

  const studentBalance = await readBalance(
    fixture.student.token,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(studentBalance.statusCode, 200);
  assert.equal(studentBalance.json().balance, 12);

  const operations = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(operations.statusCode, 200, operations.body);
  assert.equal(operations.json().total, 1);
  assert.equal(operations.json().items[0].kind, 'topup');
  assert.equal(operations.json().items[0].lessons, 12);

  const studentOperations = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.student.token)
  });
  assert.equal(studentOperations.statusCode, 200);
  assert.equal(studentOperations.json().total, 1);

  const curator = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, curator.email, ['curator']);
  const curatorBalance = await readBalance(
    curator.token,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(curatorBalance.statusCode, 200);
  assert.equal(curatorBalance.json().balance, 12);

  const curatorTopup = await topUp(
    curator.token,
    fixture.studioId,
    fixture.student.membershipId,
    1
  );
  assert.equal(curatorTopup.statusCode, 403);

  const teacherBalance = await readBalance(
    fixture.teacher.token,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(teacherBalance.statusCode, 403);

  const other = await addStudent(fixture);
  const foreignBalance = await readBalance(
    fixture.student.token,
    fixture.studioId,
    other.membershipId
  );
  assert.equal(foreignBalance.statusCode, 403);

  const foreignOperations = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, other.membershipId)}/operations`,
    headers: auth(fixture.student.token)
  });
  assert.equal(foreignOperations.statusCode, 403);

  const studentTopup = await topUp(
    fixture.student.token,
    fixture.studioId,
    fixture.student.membershipId,
    1
  );
  assert.equal(studentTopup.statusCode, 403);

  const zero = await topUp(fixture.ownerToken, fixture.studioId, fixture.student.membershipId, 0);
  assert.equal(zero.statusCode, 422);
  const tooMany = await topUp(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId,
    1000
  );
  assert.equal(tooMany.statusCode, 422);

  const notStudent = await topUp(
    fixture.ownerToken,
    fixture.studioId,
    fixture.teacher.membershipId,
    5
  );
  assert.equal(notStudent.statusCode, 422);
  assert.equal(JSON.parse(notStudent.body).error.code, 'NOT_A_STUDENT');

  const missing = await readBalance(fixture.ownerToken, fixture.studioId, randomUUID());
  assert.equal(missing.statusCode, 404);
});

test('баланс: списание, идемпотентность и возврат (T-90)', { skip }, async () => {
  const fixture = await setup();
  const sessionId = await insertSession(fixture, -5);

  const topup = await topUp(fixture.ownerToken, fixture.studioId, fixture.student.membershipId, 2);
  assert.equal(topup.statusCode, 201, topup.body);

  const marked = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(fixture.student.token)
  });
  assert.equal(marked.statusCode, 201, marked.body);
  const attendanceId = marked.json().attendance.attendanceId as string;

  const afterMark = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(afterMark.json().balance, 1);

  const operations = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(operations.json().total, 2);
  assert.equal(operations.json().items[0].kind, 'charge');
  assert.equal(operations.json().items[0].lessons, -1);
  assert.equal(operations.json().items[0].sessionId, sessionId);

  const again = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(fixture.student.token)
  });
  assert.equal(again.statusCode, 409);
  const afterAgain = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(afterAgain.json().balance, 1);

  const refunded = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'no_show', reason: 'ошибка' }
  });
  assert.equal(refunded.statusCode, 200, refunded.body);
  const afterRefund = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(afterRefund.json().balance, 2);

  const afterRefundOps = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(afterRefundOps.json().total, 3);
  assert.equal(afterRefundOps.json().items[0].kind, 'refund');
  assert.equal(afterRefundOps.json().items[0].lessons, 1);
  assert.equal(afterRefundOps.json().items[0].comment, 'ошибка');

  const back = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended' }
  });
  assert.equal(back.statusCode, 200, back.body);
  const afterBack = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(afterBack.json().balance, 1);

  const afterBackOps = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(afterBackOps.json().total, 4);
  assert.ok(['charge', 'correction'].includes(afterBackOps.json().items[0].kind));
  assert.equal(afterBackOps.json().items[0].lessons, -1);

  const sameStatus = await requireApp().inject({
    method: 'PATCH',
    url: `/api/v1/studios/${fixture.studioId}/attendance/${attendanceId}`,
    headers: auth(fixture.ownerToken),
    payload: { status: 'attended' }
  });
  assert.equal(sameStatus.statusCode, 200);
  const sameOps = await requireApp().inject({
    method: 'GET',
    url: `${balanceUrl(fixture.studioId, fixture.student.membershipId)}/operations`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(sameOps.json().total, 4);

  const broke = await addRosterStudent(fixture);
  const denied = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(broke.token)
  });
  assert.equal(denied.statusCode, 409);
  assert.equal(denied.json().error.code, 'NO_LESSONS_LEFT');

  const brokeBalance = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    broke.membershipId
  );
  assert.equal(brokeBalance.json().balance, 0);

  const roster = await requireApp().inject({
    method: 'GET',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(fixture.ownerToken)
  });
  const brokeItem = roster
    .json()
    .items.find((item: { membershipId: string }) => item.membershipId === broke.membershipId);
  assert.equal(brokeItem.status, null);
});

test('баланс: срок действия пакета и порядок списания (T-90)', { skip }, async () => {
  const fixture = await setup();
  const sessionId = await insertSession(fixture, -5);
  assert.ok(pool);

  await pool.query(
    `INSERT INTO lesson_balance_operations (studio_id, membership_id, kind, lessons, expires_on)
     VALUES ($1, $2, 'topup', 5, (now() AT TIME ZONE 'Europe/Moscow')::date - 1)`,
    [fixture.studioId, fixture.student.membershipId]
  );
  const expiredOnly = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(expiredOnly.json().balance, 0);

  const denied = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(fixture.student.token)
  });
  assert.equal(denied.statusCode, 409);
  assert.equal(denied.json().error.code, 'NO_LESSONS_LEFT');

  await pool.query(
    `INSERT INTO lesson_balance_operations (studio_id, membership_id, kind, lessons, expires_on)
     VALUES ($1, $2, 'topup', 3, (now() AT TIME ZONE 'Europe/Moscow')::date + 1)`,
    [fixture.studioId, fixture.student.membershipId]
  );
  const withValid = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(withValid.json().balance, 3);

  const marked = await requireApp().inject({
    method: 'POST',
    url: `/api/v1/studios/${fixture.studioId}/sessions/${sessionId}/attendance`,
    headers: auth(fixture.student.token)
  });
  assert.equal(marked.statusCode, 201, marked.body);
  const afterMark = await readBalance(
    fixture.ownerToken,
    fixture.studioId,
    fixture.student.membershipId
  );
  assert.equal(afterMark.json().balance, 2);

  const fifo = await addStudent(fixture);
  await pool.query(
    `INSERT INTO lesson_balance_operations (studio_id, membership_id, kind, lessons, expires_on, created_at)
     VALUES ($1, $2, 'topup', 10, (now() AT TIME ZONE 'Europe/Moscow')::date - 1, now() - interval '4 days'),
            ($1, $2, 'charge', -6, NULL, now() - interval '3 days'),
            ($1, $2, 'topup', 5, (now() AT TIME ZONE 'Europe/Moscow')::date + 2, now())`,
    [fixture.studioId, fifo.membershipId]
  );
  const fifoBalance = await readBalance(fixture.ownerToken, fixture.studioId, fifo.membershipId);
  assert.equal(fifoBalance.json().balance, 5);
});
