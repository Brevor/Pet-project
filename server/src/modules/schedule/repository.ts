import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../errors';

export interface SessionView {
  sessionId: string;
  courseId: string;
  courseName: string;
  roomId: string;
  roomName: string;
  teacherMembershipId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  seriesId: string | null;
}

interface SessionDbRow {
  id: string;
  course_id: string;
  course_name: string;
  room_id: string;
  room_name: string;
  teacher_membership_id: string;
  teacher_name: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  series_id: string | null;
}

const SELECT_SESSION = `
  SELECT s.id,
         s.course_id,
         c.name AS course_name,
         s.room_id,
         r.name AS room_name,
         s.teacher_membership_id,
         coalesce(u.display_name, u.email) AS teacher_name,
         s.starts_at,
         s.ends_at,
         s.status,
         s.series_id
    FROM class_sessions s
    JOIN courses c ON c.id = s.course_id
    JOIN rooms r ON r.id = s.room_id
    JOIN memberships m ON m.id = s.teacher_membership_id
    JOIN users u ON u.id = m.user_id
`;

function toSession(row: SessionDbRow): SessionView {
  return {
    sessionId: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    roomId: row.room_id,
    roomName: row.room_name,
    teacherMembershipId: row.teacher_membership_id,
    teacherName: row.teacher_name,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    seriesId: row.series_id
  };
}

interface WorkingHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export async function getStudioSettings(
  pool: Pool,
  studioId: string
): Promise<{ timezone: string; hours: WorkingHour[] }> {
  const studio = await pool.query<{ timezone: string }>(
    `SELECT timezone FROM studios WHERE id = $1`,
    [studioId]
  );
  const timezone = studio.rows[0]?.timezone;
  if (!timezone) {
    throw new AppError(404, 'NOT_FOUND', 'Студия не найдена');
  }

  const hours = await pool.query<{
    weekday: number;
    opens_at: string;
    closes_at: string;
    is_closed: boolean;
  }>(`SELECT weekday, opens_at, closes_at, is_closed FROM studio_working_hours WHERE studio_id = $1`, [
    studioId
  ]);

  return {
    timezone,
    hours: hours.rows.map((row) => ({
      weekday: row.weekday,
      opensAt: String(row.opens_at).slice(0, 5),
      closesAt: String(row.closes_at).slice(0, 5),
      isClosed: row.is_closed
    }))
  };
}

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

interface CourseRefs {
  durationMin: number;
  teacherMembershipId: string | null;
}

async function getCourseRefs(
  pool: Pool,
  studioId: string,
  courseId: string
): Promise<CourseRefs> {
  const { rows, rowCount } = await pool.query<{
    archived_at: string | null;
    default_duration_min: number;
    teacher_membership_id: string | null;
  }>(
    `SELECT archived_at, default_duration_min, teacher_membership_id
       FROM courses WHERE studio_id = $1 AND id = $2`,
    [studioId, courseId]
  );
  if (rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
  }
  const course = rows[0]!;
  if (course.archived_at) {
    throw new AppError(422, 'ARCHIVED_COURSE', 'Курс в архиве');
  }
  return {
    durationMin: course.default_duration_min,
    teacherMembershipId: course.teacher_membership_id
  };
}

async function assertRoom(pool: Pool, studioId: string, roomId: string): Promise<void> {
  const room = await pool.query<{ archived_at: string | null }>(
    `SELECT archived_at FROM rooms WHERE studio_id = $1 AND id = $2`,
    [studioId, roomId]
  );
  if (room.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Зал не найден');
  }
  if (room.rows[0]!.archived_at) {
    throw new AppError(422, 'ARCHIVED_ROOM', 'Зал в архиве');
  }
}

async function assertTeacher(
  pool: Pool,
  studioId: string,
  teacherMembershipId: string
): Promise<void> {
  const teacher = await pool.query<{ role: string }>(
    `SELECT mr.role
       FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.studio_id = $1 AND m.id = $2 AND m.status = 'active' AND mr.role = 'teacher'`,
    [studioId, teacherMembershipId]
  );
  if (teacher.rowCount === 0) {
    throw new AppError(422, 'NOT_A_TEACHER', 'Участник не является преподавателем');
  }
}

async function resolveTeacher(
  pool: Pool,
  studioId: string,
  explicit: string | undefined,
  fallback: string | null
): Promise<string> {
  const teacherMembershipId = explicit ?? fallback;
  if (!teacherMembershipId) {
    throw new AppError(422, 'VALIDATION', 'Не указан преподаватель', {
      fields: {
        teacherMembershipId: 'Укажите преподавателя: у курса нет преподавателя по умолчанию'
      }
    });
  }
  await assertTeacher(pool, studioId, teacherMembershipId);
  return teacherMembershipId;
}

interface ConflictRow {
  id: string;
  room_id: string;
  teacher_membership_id: string;
  starts_at: Date;
  ends_at: Date;
}

async function findConflict(
  pool: Pool,
  studioId: string,
  roomId: string,
  teacherMembershipId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string
): Promise<ConflictRow | null> {
  const { rows } = await pool.query<ConflictRow>(
    `SELECT id, room_id, teacher_membership_id, starts_at, ends_at
       FROM class_sessions
      WHERE studio_id = $1
        AND status = 'scheduled'
        AND (room_id = $2 OR teacher_membership_id = $3)
        AND tstzrange(starts_at, ends_at) && tstzrange($4::timestamptz, $5::timestamptz)
        AND ($6::uuid IS NULL OR id <> $6)
      LIMIT 1`,
    [studioId, roomId, teacherMembershipId, startsAt, endsAt, excludeId ?? null]
  );
  return rows[0] ?? null;
}

function conflictError(row: ConflictRow, roomId: string): never {
  const details = {
    conflictingSessionId: row.id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString()
  };
  if (row.room_id === roomId) {
    throw new AppError(409, 'ROOM_CONFLICT', 'Зал занят в это время', details);
  }
  throw new AppError(409, 'TEACHER_CONFLICT', 'Преподаватель занят в это время', details);
}

async function insertSession(
  client: Pool | PoolClient,
  input: {
    studioId: string;
    seriesId: string | null;
    courseId: string;
    roomId: string;
    teacherMembershipId: string;
    startsAt: string;
    endsAt: string;
  }
): Promise<{ id: string; startsAt: string; endsAt: string }> {
  const { rows } = await client.query<{ id: string; starts_at: Date; ends_at: Date }>(
    `INSERT INTO class_sessions (studio_id, series_id, course_id, room_id, teacher_membership_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, starts_at, ends_at`,
    [
      input.studioId,
      input.seriesId,
      input.courseId,
      input.roomId,
      input.teacherMembershipId,
      input.startsAt,
      input.endsAt
    ]
  );
  const row = rows[0]!;
  return { id: row.id, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString() };
}

function queryFailedWithOverlap(error: unknown): boolean {
  return (error as { code?: string }).code === '23P01';
}

export interface SingleSessionInput {
  courseId: string;
  roomId: string;
  teacherMembershipId?: string;
  startsAt: string;
}

export async function createSingleSession(
  pool: Pool,
  studioId: string,
  input: SingleSessionInput
): Promise<{ created: number; seriesId: null; items: Array<{ sessionId: string; startsAt: string; endsAt: string }> }> {
  const course = await getCourseRefs(pool, studioId, input.courseId);
  await assertRoom(pool, studioId, input.roomId);
  const teacherMembershipId = await resolveTeacher(
    pool,
    studioId,
    input.teacherMembershipId,
    course.teacherMembershipId
  );
  const durationMin = course.durationMin;

  const { timezone, hours } = await getStudioSettings(pool, studioId);
  const local = await pool.query<{ dow: number; start_time: string }>(
    `SELECT extract(isodow from ($1::timestamptz AT TIME ZONE $2))::int AS dow,
            to_char($1::timestamptz AT TIME ZONE $2, 'HH24:MI') AS start_time`,
    [input.startsAt, timezone]
  );

  const localRow = local.rows[0]!;
  const day = hours.find((hour) => hour.weekday === localRow.dow);
  if (!day || day.isClosed) {
    throw new AppError(422, 'OUTSIDE_WORKING_HOURS', 'В этот день студия не работает');
  }
  const startMinutes = minutes(localRow.start_time);
  if (startMinutes < minutes(day.opensAt) || startMinutes + durationMin > minutes(day.closesAt)) {
    throw new AppError(
      422,
      'OUTSIDE_WORKING_HOURS',
      `Сеанс выходит за рабочие часы (${day.opensAt}–${day.closesAt})`
    );
  }

  const endsAt = new Date(new Date(input.startsAt).getTime() + durationMin * 60_000).toISOString();

  const conflict = await findConflict(
    pool,
    studioId,
    input.roomId,
    teacherMembershipId,
    input.startsAt,
    endsAt
  );
  if (conflict) conflictError(conflict, input.roomId);

  try {
    const item = await insertSession(pool, {
      studioId,
      seriesId: null,
      courseId: input.courseId,
      roomId: input.roomId,
      teacherMembershipId,
      startsAt: input.startsAt,
      endsAt
    });
    return { created: 1, seriesId: null, items: [{ sessionId: item.id, startsAt: item.startsAt, endsAt: item.endsAt }] };
  } catch (error) {
    if (queryFailedWithOverlap(error)) {
      throw new AppError(409, 'ROOM_CONFLICT', 'Зал или преподаватель заняты в это время');
    }
    throw error;
  }
}

export interface SeriesInput {
  courseId: string;
  roomId: string;
  teacherMembershipId?: string;
  weekdays: number[];
  startTime: string;
  startsOn: string;
  until: string;
}

export async function createSeries(
  pool: Pool,
  studioId: string,
  input: SeriesInput
): Promise<{ created: number; seriesId: string; items: Array<{ sessionId: string; startsAt: string; endsAt: string }> }> {
  const course = await getCourseRefs(pool, studioId, input.courseId);
  await assertRoom(pool, studioId, input.roomId);
  const teacherMembershipId = await resolveTeacher(
    pool,
    studioId,
    input.teacherMembershipId,
    course.teacherMembershipId
  );
  const durationMin = course.durationMin;

  const startsOn = new Date(`${input.startsOn}T00:00:00Z`);
  const until = new Date(`${input.until}T00:00:00Z`);
  if (Number.isNaN(startsOn.getTime()) || Number.isNaN(until.getTime()) || until < startsOn) {
    throw new AppError(422, 'VALIDATION', 'Некорректный период серии');
  }
  if (until.getTime() - startsOn.getTime() > 365 * 24 * 60 * 60 * 1000) {
    throw new AppError(422, 'DATE_RANGE_TOO_LONG', 'Серия длиннее 52 недель');
  }

  const { timezone, hours } = await getStudioSettings(pool, studioId);
  const start = minutes(input.startTime);
  const end = start + durationMin;

  for (const weekday of input.weekdays) {
    const hour = hours.find((item) => item.weekday === weekday);
    if (!hour || hour.isClosed) {
      throw new AppError(422, 'OUTSIDE_WORKING_HOURS', `День ${weekday} — нерабочий`);
    }
    if (start < minutes(hour.opensAt) || end > minutes(hour.closesAt)) {
      throw new AppError(
        422,
        'OUTSIDE_WORKING_HOURS',
        `Сеанс выходит за рабочие часы (${hour.opensAt}–${hour.closesAt})`
      );
    }
  }

  const dates: string[] = [];
  for (let cursor = new Date(startsOn); cursor <= until; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const isoWeekday = ((cursor.getUTCDay() + 6) % 7) + 1;
    if (input.weekdays.includes(isoWeekday)) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
  }

  if (dates.length === 0) {
    throw new AppError(422, 'VALIDATION', 'В выбранном периоде нет дат для этих дней недели');
  }

  const slots = await Promise.all(
    dates.map(async (date) => {
      const { rows } = await pool.query<{ starts_at: Date; ends_at: Date }>(
        `SELECT (($1::date + $2::time) AT TIME ZONE $3) AS starts_at,
                (($1::date + $2::time) AT TIME ZONE $3) + make_interval(mins => $4) AS ends_at`,
        [date, input.startTime, timezone, durationMin]
      );
      return {
        date,
        startsAt: rows[0]!.starts_at.toISOString(),
        endsAt: rows[0]!.ends_at.toISOString()
      };
    })
  );

  for (const slot of slots) {
    const conflict = await findConflict(
      pool,
      studioId,
      input.roomId,
      teacherMembershipId,
      slot.startsAt,
      slot.endsAt
    );
    if (conflict) conflictError(conflict, input.roomId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const series = await client.query<{ id: string }>(
      `INSERT INTO class_series (studio_id, course_id, room_id, teacher_membership_id, weekdays,
                                 start_time, duration_min, starts_on, until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        studioId,
        input.courseId,
        input.roomId,
        teacherMembershipId,
        input.weekdays,
        input.startTime,
        durationMin,
        input.startsOn,
        input.until
      ]
    );
    const seriesId = series.rows[0]!.id;

    const items: Array<{ sessionId: string; startsAt: string; endsAt: string }> = [];
    for (const slot of slots) {
      const item = await insertSession(client, {
        studioId,
        seriesId,
        courseId: input.courseId,
        roomId: input.roomId,
        teacherMembershipId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt
      });
      items.push({ sessionId: item.id, startsAt: item.startsAt, endsAt: item.endsAt });
    }

    await client.query('COMMIT');
    return { created: items.length, seriesId, items };
  } catch (error) {
    await client.query('ROLLBACK');
    if (queryFailedWithOverlap(error)) {
      throw new AppError(409, 'ROOM_CONFLICT', 'Зал или преподаватель заняты в это время');
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface ScheduleFilter {
  from: string;
  to: string;
  roomId?: string;
  teacherMembershipId?: string;
  courseId?: string;
}

export async function listSchedule(
  pool: Pool,
  studioId: string,
  filter: ScheduleFilter
): Promise<SessionView[]> {
  const from = new Date(`${filter.from}T00:00:00Z`);
  const to = new Date(`${filter.to}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new AppError(422, 'VALIDATION', 'Некорректный период');
  }
  if (to.getTime() - from.getTime() > 92 * 24 * 60 * 60 * 1000) {
    throw new AppError(422, 'DATE_RANGE_TOO_LONG', 'Диапазон больше 92 дней');
  }

  const { rows } = await pool.query<SessionDbRow>(
    `${SELECT_SESSION}
      WHERE s.studio_id = $1
        AND s.starts_at >= $2::date
        AND s.starts_at < ($3::date + interval '1 day')
        AND ($4::uuid IS NULL OR s.room_id = $4)
        AND ($5::uuid IS NULL OR s.teacher_membership_id = $5)
        AND ($6::uuid IS NULL OR s.course_id = $6)
      ORDER BY s.starts_at`,
    [studioId, filter.from, filter.to, filter.roomId ?? null, filter.teacherMembershipId ?? null, filter.courseId ?? null]
  );

  return rows.map(toSession);
}

export async function updateSession(
  pool: Pool,
  studioId: string,
  sessionId: string,
  patch: { roomId?: string; teacherMembershipId?: string; startsAt?: string }
): Promise<SessionView> {
  const { rows } = await pool.query<{
    course_id: string;
    room_id: string;
    teacher_membership_id: string;
    starts_at: Date;
    ends_at: Date;
  }>(`SELECT course_id, room_id, teacher_membership_id, starts_at, ends_at FROM class_sessions WHERE studio_id = $1 AND id = $2`, [
    studioId,
    sessionId
  ]);

  const current = rows[0];
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
  }

  const roomId = patch.roomId ?? current.room_id;
  const teacherMembershipId = patch.teacherMembershipId ?? current.teacher_membership_id;
  const startsAt = patch.startsAt ?? current.starts_at.toISOString();
  const durationMin = Math.round((current.ends_at.getTime() - current.starts_at.getTime()) / 60_000);
  const endsAt = new Date(new Date(startsAt).getTime() + durationMin * 60_000).toISOString();

  await getCourseRefs(pool, studioId, current.course_id);
  await assertRoom(pool, studioId, roomId);
  await assertTeacher(pool, studioId, teacherMembershipId);

  const conflict = await findConflict(pool, studioId, roomId, teacherMembershipId, startsAt, endsAt, sessionId);
  if (conflict) conflictError(conflict, roomId);

  try {
    await pool.query(
      `UPDATE class_sessions SET room_id = $3, teacher_membership_id = $4, starts_at = $5, ends_at = $6
        WHERE studio_id = $1 AND id = $2`,
      [studioId, sessionId, roomId, teacherMembershipId, startsAt, endsAt]
    );
  } catch (error) {
    if (queryFailedWithOverlap(error)) {
      throw new AppError(409, 'ROOM_CONFLICT', 'Зал или преподаватель заняты в это время');
    }
    throw error;
  }

  const updated = await listSchedule(pool, studioId, {
    from: startsAt.slice(0, 10),
    to: startsAt.slice(0, 10)
  });
  const found = updated.find((item) => item.sessionId === sessionId);
  if (!found) {
    throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
  }
  return found;
}

export async function cancelSession(pool: Pool, studioId: string, sessionId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE class_sessions SET status = 'cancelled' WHERE studio_id = $1 AND id = $2`,
    [studioId, sessionId]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
  }
}

export async function deleteSession(pool: Pool, studioId: string, sessionId: string): Promise<void> {
  const result = await pool.query(`DELETE FROM class_sessions WHERE studio_id = $1 AND id = $2`, [
    studioId,
    sessionId
  ]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
  }
}

export async function deleteSeries(
  pool: Pool,
  studioId: string,
  seriesId: string,
  futureOnly: boolean
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM class_sessions
      WHERE studio_id = $1 AND series_id = $2
        AND ($3::boolean = false OR starts_at >= now())`,
    [studioId, seriesId, futureOnly]
  );

  const remaining = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM class_sessions WHERE studio_id = $1 AND series_id = $2`,
    [studioId, seriesId]
  );
  if (Number(remaining.rows[0]?.count ?? '0') === 0) {
    await pool.query('DELETE FROM class_series WHERE studio_id = $1 AND id = $2', [studioId, seriesId]);
  }

  return result.rowCount ?? 0;
}

