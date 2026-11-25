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
  const email = `ach-${randomUUID()}@example.com`;
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

interface Person {
  token: string;
  membershipId: string;
  email: string;
}

interface Fixture {
  studioId: string;
  ownerToken: string;
  student: Person;
  teacher: Person;
}

async function setup(): Promise<Fixture> {
  const owner = await registerUser();
  const studioId = await createStudio(owner.token);

  const student = await registerUser();
  const studentMembershipId = await addMember(owner.token, studioId, student.email, ['student']);

  const teacher = await registerUser();
  const teacherMembershipId = await addMember(owner.token, studioId, teacher.email, ['teacher']);

  return {
    studioId,
    ownerToken: owner.token,
    student: { token: student.token, membershipId: studentMembershipId, email: student.email },
    teacher: { token: teacher.token, membershipId: teacherMembershipId, email: teacher.email }
  };
}

function catalogUrl(studioId: string, query = ''): string {
  return `/api/v1/studios/${studioId}/achievements${query}`;
}

function studentUrl(studioId: string, membershipId: string, query = ''): string {
  return `/api/v1/studios/${studioId}/students/${membershipId}/achievements${query}`;
}

async function loadCatalog(
  token: string,
  studioId: string
): Promise<Array<{ achievementId: string; name: string; archived: boolean }>> {
  const response = await requireApp().inject({
    method: 'GET',
    url: catalogUrl(studioId),
    headers: auth(token)
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().items;
}

test('достижения: предустановленный каталог, CRUD и права (T-91)', { skip }, async () => {
  const fixture = await setup();

  const preset = await loadCatalog(fixture.ownerToken, fixture.studioId);
  assert.equal(preset.length, 3);
  assert.ok(preset.some((item) => item.name === 'Первый выход на сцену'));

  const created = await requireApp().inject({
    method: 'POST',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.ownerToken),
    payload: {
      name: 'Лучший ученик',
      description: 'За победу в конкурсе',
      eventDate: '2026-11-01'
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  const achievementId = created.json().achievement.achievementId as string;
  assert.equal(created.json().achievement.name, 'Лучший ученик');
  assert.equal(created.json().achievement.eventDate, '2026-11-01');
  assert.equal(created.json().achievement.archived, false);

  const duplicate = await requireApp().inject({
    method: 'POST',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.ownerToken),
    payload: { name: 'лучший ученик' }
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, 'ACHIEVEMENT_NAME_TAKEN');

  const invalid = await requireApp().inject({
    method: 'POST',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.ownerToken),
    payload: { name: 'X' }
  });
  assert.equal(invalid.statusCode, 422);

  const renamed = await requireApp().inject({
    method: 'PATCH',
    url: `${catalogUrl(fixture.studioId)}/${achievementId}`,
    headers: auth(fixture.ownerToken),
    payload: { name: 'Лучший ученик месяца', description: null }
  });
  assert.equal(renamed.statusCode, 200, renamed.body);
  assert.equal(renamed.json().achievement.name, 'Лучший ученик месяца');
  assert.equal(renamed.json().achievement.description, null);

  const archived = await requireApp().inject({
    method: 'PATCH',
    url: `${catalogUrl(fixture.studioId)}/${achievementId}`,
    headers: auth(fixture.ownerToken),
    payload: { archived: true }
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json().achievement.archived, true);

  const visible = await loadCatalog(fixture.ownerToken, fixture.studioId);
  assert.equal(visible.length, 3);
  const withArchived = await requireApp().inject({
    method: 'GET',
    url: catalogUrl(fixture.studioId, '?includeArchived=true'),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(withArchived.json().total, 4);

  const missingPatch = await requireApp().inject({
    method: 'PATCH',
    url: `${catalogUrl(fixture.studioId)}/${randomUUID()}`,
    headers: auth(fixture.ownerToken),
    payload: { name: 'Нет такого' }
  });
  assert.equal(missingPatch.statusCode, 404);

  const deleted = await requireApp().inject({
    method: 'DELETE',
    url: `${catalogUrl(fixture.studioId)}/${achievementId}`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(deleted.statusCode, 204, deleted.body);

  const curator = await registerUser();
  await addMember(fixture.ownerToken, fixture.studioId, curator.email, ['curator']);
  const curatorCreated = await requireApp().inject({
    method: 'POST',
    url: catalogUrl(fixture.studioId),
    headers: auth(curator.token),
    payload: { name: 'Приз зрительских симпатий' }
  });
  assert.equal(curatorCreated.statusCode, 201, curatorCreated.body);

  const teacherCreated = await requireApp().inject({
    method: 'POST',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.teacher.token),
    payload: { name: 'Нельзя' }
  });
  assert.equal(teacherCreated.statusCode, 403);

  const studentCatalog = await requireApp().inject({
    method: 'GET',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.student.token)
  });
  assert.equal(studentCatalog.statusCode, 403);

  const teacherCatalog = await requireApp().inject({
    method: 'GET',
    url: catalogUrl(fixture.studioId),
    headers: auth(fixture.teacher.token)
  });
  assert.equal(teacherCatalog.statusCode, 200);
});

test('достижения: выдача, отзыв и карточка ученика (T-91)', { skip }, async () => {
  const fixture = await setup();
  const catalog = await loadCatalog(fixture.ownerToken, fixture.studioId);
  const target = catalog[0]!;

  const empty = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.json().total, 0);

  const awarded = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.ownerToken),
    payload: { achievementId: target.achievementId, comment: 'Так держать' }
  });
  assert.equal(awarded.statusCode, 201, awarded.body);
  const awardId = awarded.json().award.awardId as string;
  assert.equal(awarded.json().award.name, target.name);
  assert.equal(awarded.json().award.comment, 'Так держать');

  const again = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.ownerToken),
    payload: { achievementId: target.achievementId }
  });
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error.code, 'ALREADY_AWARDED');

  const own = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().total, 1);
  assert.equal(own.json().items[0].achievementId, target.achievementId);

  const other = await registerUser();
  const otherMembershipId = await addMember(fixture.ownerToken, fixture.studioId, other.email, [
    'student'
  ]);
  const foreign = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, otherMembershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(foreign.statusCode, 403);

  const staffView = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.teacher.token)
  });
  assert.equal(staffView.statusCode, 200);
  assert.equal(staffView.json().total, 1);

  const studentAward = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, otherMembershipId),
    headers: auth(fixture.student.token),
    payload: { achievementId: target.achievementId }
  });
  assert.equal(studentAward.statusCode, 403);

  const notStudent = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, fixture.teacher.membershipId),
    headers: auth(fixture.ownerToken),
    payload: { achievementId: target.achievementId }
  });
  assert.equal(notStudent.statusCode, 422);
  assert.equal(notStudent.json().error.code, 'NOT_A_STUDENT');

  const unknownAchievement = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, otherMembershipId),
    headers: auth(fixture.ownerToken),
    payload: { achievementId: randomUUID() }
  });
  assert.equal(unknownAchievement.statusCode, 404);

  const inUse = await requireApp().inject({
    method: 'DELETE',
    url: `${catalogUrl(fixture.studioId)}/${target.achievementId}`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(inUse.statusCode, 409);
  assert.equal(inUse.json().error.code, 'ACHIEVEMENT_IN_USE');

  const archived = await requireApp().inject({
    method: 'PATCH',
    url: `${catalogUrl(fixture.studioId)}/${target.achievementId}`,
    headers: auth(fixture.ownerToken),
    payload: { archived: true }
  });
  assert.equal(archived.statusCode, 200);

  const archivedAward = await requireApp().inject({
    method: 'POST',
    url: studentUrl(fixture.studioId, otherMembershipId),
    headers: auth(fixture.ownerToken),
    payload: { achievementId: target.achievementId }
  });
  assert.equal(archivedAward.statusCode, 422);
  assert.equal(archivedAward.json().error.code, 'ACHIEVEMENT_ARCHIVED');

  const stillVisible = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(stillVisible.json().total, 1);

  const revoked = await requireApp().inject({
    method: 'DELETE',
    url: `${studentUrl(fixture.studioId, fixture.student.membershipId)}/${awardId}`,
    headers: auth(fixture.ownerToken),
    payload: { reason: 'выдано ошибочно' }
  });
  assert.equal(revoked.statusCode, 204, revoked.body);

  const afterRevoke = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId),
    headers: auth(fixture.student.token)
  });
  assert.equal(afterRevoke.json().total, 0);

  const history = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId, '?includeRevoked=true'),
    headers: auth(fixture.ownerToken)
  });
  assert.equal(history.json().total, 1);
  assert.ok(history.json().items[0].revokedAt);
  assert.equal(history.json().items[0].comment, 'выдано ошибочно');

  const studentHistory = await requireApp().inject({
    method: 'GET',
    url: studentUrl(fixture.studioId, fixture.student.membershipId, '?includeRevoked=true'),
    headers: auth(fixture.student.token)
  });
  assert.equal(studentHistory.json().total, 0);

  const revokeAgain = await requireApp().inject({
    method: 'DELETE',
    url: `${studentUrl(fixture.studioId, fixture.student.membershipId)}/${awardId}`,
    headers: auth(fixture.ownerToken)
  });
  assert.equal(revokeAgain.statusCode, 404);
});
