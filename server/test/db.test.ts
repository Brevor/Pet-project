import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const skip = databaseUrl ? false : 'DATABASE_URL не задан';

async function withTransaction(
  fn: (client: Client) => Promise<void>
): Promise<void> {
  assert.ok(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('BEGIN');
  try {
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

async function seedStudio(client: Client): Promise<{ studioId: string; roomId: string; courseId: string; teacherId: string; userId: string }> {
  const user = await client.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
    [`u${Math.random().toString(36).slice(2)}@test.ru`]
  );
  const userId = user.rows[0]!.id;

  const studio = await client.query<{ id: string }>(
    "INSERT INTO studios (name, referral_code) VALUES ('Тестовая студия', $1) RETURNING id",
    [`t${Math.random().toString(36).slice(2, 10)}`]
  );
  const studioId = studio.rows[0]!.id;

  const membership = await client.query<{ id: string }>(
    'INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id',
    [studioId, userId]
  );
  const teacherId = membership.rows[0]!.id;

  await client.query(
    "INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'teacher')",
    [teacherId, studioId]
  );

  const room = await client.query<{ id: string }>(
    "INSERT INTO rooms (studio_id, name, capacity) VALUES ($1, 'Зал А', 20) RETURNING id",
    [studioId]
  );
  const course = await client.query<{ id: string }>(
    `INSERT INTO courses (studio_id, name, kind, default_duration_min, capacity)
     VALUES ($1, 'Hip-Hop', 'group', 90, 12) RETURNING id`,
    [studioId]
  );

  return {
    studioId,
    roomId: room.rows[0]!.id,
    courseId: course.rows[0]!.id,
    teacherId,
    userId
  };
}

function insertSession(
  client: Client,
  seed: { studioId: string; roomId: string; courseId: string; teacherId: string },
  roomId: string,
  teacherId: string,
  startsAt: string,
  endsAt: string
) {
  return client.query(
    `INSERT INTO class_sessions (studio_id, course_id, room_id, teacher_membership_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [seed.studioId, seed.courseId, roomId, teacherId, startsAt, endsAt]
  );
}

test('схема содержит все таблицы модуля', { skip }, async () => {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const names = rows.map((row) => row.table_name);
    for (const table of [
      'users',
      'studios',
      'studio_working_hours',
      'memberships',
      'membership_roles',
      'rooms',
      'courses',
      'class_series',
      'class_sessions'
    ]) {
      assert.ok(names.includes(table), `нет таблицы ${table}`);
    }
  });
});

test('второй владелец студии невозможен', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);
    await client.query(
      `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'owner')`,
      [seed.teacherId, seed.studioId]
    );

    const secondUser = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [`o${Math.random().toString(36).slice(2)}@test.ru`]
    );
    const secondMembership = await client.query<{ id: string }>(
      'INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id',
      [seed.studioId, secondUser.rows[0]!.id]
    );

    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'owner')`,
          [secondMembership.rows[0]!.id, seed.studioId]
        ),
      (error: { code?: string }) => error.code === '23505'
    );
  });
});

test('пересечение по залу запрещено', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);
    const other = await client.query<{ id: string }>(
      "INSERT INTO rooms (studio_id, name, capacity) VALUES ($1, 'Зал Б', 10) RETURNING id",
      [seed.studioId]
    );

    await insertSession(client, seed, seed.roomId, seed.teacherId, '2026-12-01T15:00:00Z', '2026-12-01T16:30:00Z');

    await client.query('SAVEPOINT overlap');
    await assert.rejects(
      () =>
        insertSession(
          client,
          seed,
          seed.roomId,
          seed.teacherId,
          '2026-12-01T16:00:00Z',
          '2026-12-01T17:00:00Z'
        ),
      (error: { code?: string }) => error.code === '23P01'
    );
    await client.query('ROLLBACK TO SAVEPOINT overlap');

    // другой зал и другое время — можно
    await insertSession(client, seed, other.rows[0]!.id, seed.teacherId, '2026-12-01T18:00:00Z', '2026-12-01T19:00:00Z');
  });
});

test('пересечение по преподавателю запрещено', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);
    const other = await client.query<{ id: string }>(
      "INSERT INTO rooms (studio_id, name, capacity) VALUES ($1, 'Зал В', 10) RETURNING id",
      [seed.studioId]
    );

    await insertSession(client, seed, seed.roomId, seed.teacherId, '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z');

    await assert.rejects(
      () =>
        insertSession(
          client,
          seed,
          other.rows[0]!.id,
          seed.teacherId,
          '2026-12-02T10:30:00Z',
          '2026-12-02T11:30:00Z'
        ),
      (error: { code?: string }) => error.code === '23P01'
    );
  });
});

test('отменённый сеанс не блокирует слот', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);
    await client.query(
      `INSERT INTO class_sessions (studio_id, course_id, room_id, teacher_membership_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'cancelled')`,
      [seed.studioId, seed.courseId, seed.roomId, seed.teacherId, '2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z']
    );

    await insertSession(client, seed, seed.roomId, seed.teacherId, '2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z');
  });
});

test('преподаватель курса обнуляется при удалении членства', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);

    await client.query('UPDATE courses SET teacher_membership_id = $1 WHERE id = $2', [
      seed.teacherId,
      seed.courseId
    ]);
    const assigned = await client.query<{ teacher_membership_id: string | null }>(
      'SELECT teacher_membership_id FROM courses WHERE id = $1',
      [seed.courseId]
    );
    assert.equal(assigned.rows[0]!.teacher_membership_id, seed.teacherId);

    await client.query('DELETE FROM memberships WHERE id = $1', [seed.teacherId]);

    const cleared = await client.query<{ teacher_membership_id: string | null }>(
      'SELECT teacher_membership_id FROM courses WHERE id = $1',
      [seed.courseId]
    );
    assert.equal(cleared.rows[0]!.teacher_membership_id, null);
  });
});

test('курс не может ссылаться на преподавателя другой студии', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);

    const otherUser = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [`o${Math.random().toString(36).slice(2)}@test.ru`]
    );
    const otherStudio = await client.query<{ id: string }>(
      'INSERT INTO studios (name, referral_code) VALUES ($1, $2) RETURNING id',
      ['Другая студия', `t${Math.random().toString(36).slice(2, 10)}`]
    );
    const otherMembership = await client.query<{ id: string }>(
      'INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id',
      [otherStudio.rows[0]!.id, otherUser.rows[0]!.id]
    );

    await assert.rejects(
      () =>
        client.query('UPDATE courses SET teacher_membership_id = $1 WHERE id = $2', [
          otherMembership.rows[0]!.id,
          seed.courseId
        ]),
      (error: { code?: string }) => error.code === '23503'
    );
  });
});

test('день недели серии ограничен 1–7 на уровне БД', { skip }, async () => {
  await withTransaction(async (client) => {
    const seed = await seedStudio(client);

    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO class_series (studio_id, course_id, room_id, teacher_membership_id,
                                     weekdays, start_time, duration_min, starts_on, until)
           VALUES ($1, $2, $3, $4, ARRAY[0,1]::smallint[], '18:00', 90, '2027-01-04', '2027-01-11')`,
          [seed.studioId, seed.courseId, seed.roomId, seed.teacherId]
        ),
      (error: { code?: string }) => error.code === '23514'
    );
  });

  await withTransaction(async (client) => {
    const seed = await seedStudio(client);

    const ok = await client.query(
      `INSERT INTO class_series (studio_id, course_id, room_id, teacher_membership_id,
                                 weekdays, start_time, duration_min, starts_on, until)
       VALUES ($1, $2, $3, $4, ARRAY[1,7]::smallint[], '18:00', 90, '2027-01-04', '2027-01-11')`,
      [seed.studioId, seed.courseId, seed.roomId, seed.teacherId]
    );
    assert.equal(ok.rowCount, 1);
  });
});

test('роль не может ссылаться на членство чужой студии', { skip }, async () => {
  await withTransaction(async (client) => {
    const first = await seedStudio(client);
    const second = await seedStudio(client);

    await assert.rejects(
      () =>
        client.query('INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, $3)', [
          first.teacherId,
          second.studioId,
          'assistant'
        ]),
      (error: { code?: string }) => error.code === '23503'
    );
  });
});
