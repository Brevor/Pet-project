import type { Pool } from 'pg';
import { AppError } from '../../errors';

export interface CourseRow {
  id: string;
  name: string;
  direction: string | null;
  level: string;
  kind: string;
  defaultDurationMin: number;
  capacity: number;
  teacherMembershipId: string | null;
  teacherName: string | null;
  archived: boolean;
}

interface CourseDbRow {
  id: string;
  name: string;
  direction: string | null;
  level: string;
  kind: string;
  default_duration_min: number;
  capacity: number;
  teacher_membership_id: string | null;
  teacher_name: string | null;
  archived_at: string | null;
}

const SELECT_COURSE = `
  SELECT c.id,
         c.name,
         c.direction,
         c.level,
         c.kind,
         c.default_duration_min,
         c.capacity,
         c.teacher_membership_id,
         coalesce(u.display_name, u.email) AS teacher_name,
         c.archived_at
    FROM courses c
    LEFT JOIN memberships m ON m.id = c.teacher_membership_id
    LEFT JOIN users u ON u.id = m.user_id
`;

function toCourse(row: CourseDbRow): CourseRow {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    level: row.level,
    kind: row.kind,
    defaultDurationMin: row.default_duration_min,
    capacity: row.capacity,
    teacherMembershipId: row.teacher_membership_id,
    teacherName: row.teacher_name,
    archived: row.archived_at !== null
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23503';
}

async function assertTeacher(pool: Pool, studioId: string, membershipId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `SELECT 1
       FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.studio_id = $1 AND m.id = $2 AND m.status = 'active' AND mr.role = 'teacher'`,
    [studioId, membershipId]
  );
  if (rowCount === 0) {
    throw new AppError(422, 'NOT_A_TEACHER', 'Участник не является преподавателем');
  }
}

async function findCourse(pool: Pool, studioId: string, courseId: string): Promise<CourseRow> {
  const { rows } = await pool.query<CourseDbRow>(
    `${SELECT_COURSE} WHERE c.studio_id = $1 AND c.id = $2`,
    [studioId, courseId]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
  }
  return toCourse(row);
}

export async function listCourses(
  pool: Pool,
  studioId: string,
  includeArchived: boolean,
  search?: string
): Promise<CourseRow[]> {
  const { rows } = await pool.query<CourseDbRow>(
    `${SELECT_COURSE}
      WHERE c.studio_id = $1 AND ($2::boolean OR c.archived_at IS NULL)
        AND ($3::text IS NULL
             OR c.name ILIKE '%' || $3 || '%'
             OR COALESCE(c.direction, '') ILIKE '%' || $3 || '%')
      ORDER BY c.name`,
    [studioId, includeArchived, search?.trim() || null]
  );
  return rows.map(toCourse);
}

export interface CourseInput {
  name: string;
  direction?: string;
  level: string;
  kind: string;
  defaultDurationMin: number;
  capacity: number;
  teacherMembershipId?: string | null;
}

export async function createCourse(
  pool: Pool,
  studioId: string,
  input: CourseInput
): Promise<CourseRow> {
  if (input.teacherMembershipId) {
    await assertTeacher(pool, studioId, input.teacherMembershipId);
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO courses (studio_id, name, direction, level, kind, default_duration_min, capacity, teacher_membership_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        studioId,
        input.name,
        input.direction ?? null,
        input.level,
        input.kind,
        input.defaultDurationMin,
        input.capacity,
        input.teacherMembershipId ?? null
      ]
    );
    return await findCourse(pool, studioId, rows[0]!.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'COURSE_NAME_TAKEN', 'Курс с таким названием уже есть');
    }
    if (isForeignKeyViolation(error)) {
      throw new AppError(422, 'NOT_A_TEACHER', 'Участник не является преподавателем');
    }
    throw error;
  }
}

export async function updateCourse(
  pool: Pool,
  studioId: string,
  courseId: string,
  patch: Partial<CourseInput> & { archived?: boolean }
): Promise<CourseRow> {
  if (patch.teacherMembershipId) {
    await assertTeacher(pool, studioId, patch.teacherMembershipId);
  }

  const hasTeacher = Object.prototype.hasOwnProperty.call(patch, 'teacherMembershipId');

  try {
    const { rows } = await pool.query<{ id: string }>(
      `UPDATE courses SET
         name = COALESCE($3, name),
         direction = COALESCE($4, direction),
         level = COALESCE($5, level),
         kind = COALESCE($6, kind),
         default_duration_min = COALESCE($7, default_duration_min),
         capacity = COALESCE($8, capacity),
         archived_at = CASE
           WHEN $9::boolean IS NULL THEN archived_at
           WHEN $9::boolean THEN COALESCE(archived_at, now())
           ELSE NULL
         END,
         teacher_membership_id = CASE
           WHEN $10::boolean THEN $11::uuid
           ELSE teacher_membership_id
         END
       WHERE studio_id = $1 AND id = $2
       RETURNING id`,
      [
        studioId,
        courseId,
        patch.name ?? null,
        patch.direction ?? null,
        patch.level ?? null,
        patch.kind ?? null,
        patch.defaultDurationMin ?? null,
        patch.capacity ?? null,
        patch.archived ?? null,
        hasTeacher,
        patch.teacherMembershipId ?? null
      ]
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
    }
    return await findCourse(pool, studioId, row.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'COURSE_NAME_TAKEN', 'Курс с таким названием уже есть');
    }
    if (isForeignKeyViolation(error)) {
      throw new AppError(422, 'NOT_A_TEACHER', 'Участник не является преподавателем');
    }
    throw error;
  }
}

export async function deleteCourse(pool: Pool, studioId: string, courseId: string): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM class_sessions WHERE studio_id = $1 AND course_id = $2`,
    [studioId, courseId]
  );
  if (Number(rows[0]?.count ?? '0') > 0) {
    throw new AppError(
      409,
      'COURSE_IN_USE',
      'У курса есть занятия — архивируйте его вместо удаления'
    );
  }

  const result = await pool.query(`DELETE FROM courses WHERE studio_id = $1 AND id = $2`, [
    studioId,
    courseId
  ]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
  }
}
