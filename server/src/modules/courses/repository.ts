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
  archived_at: string | null;
}

const COLUMNS = `id, name, direction, level, kind, default_duration_min, capacity, archived_at`;

function toCourse(row: CourseDbRow): CourseRow {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    level: row.level,
    kind: row.kind,
    defaultDurationMin: row.default_duration_min,
    capacity: row.capacity,
    archived: row.archived_at !== null
  };
}

export async function listCourses(
  pool: Pool,
  studioId: string,
  includeArchived: boolean
): Promise<CourseRow[]> {
  const { rows } = await pool.query<CourseDbRow>(
    `SELECT ${COLUMNS} FROM courses
      WHERE studio_id = $1 AND ($2::boolean OR archived_at IS NULL)
      ORDER BY name`,
    [studioId, includeArchived]
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
}

export async function createCourse(
  pool: Pool,
  studioId: string,
  input: CourseInput
): Promise<CourseRow> {
  try {
    const { rows } = await pool.query<CourseDbRow>(
      `INSERT INTO courses (studio_id, name, direction, level, kind, default_duration_min, capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        studioId,
        input.name,
        input.direction ?? null,
        input.level,
        input.kind,
        input.defaultDurationMin,
        input.capacity
      ]
    );
    return toCourse(rows[0]!);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'COURSE_NAME_TAKEN', 'Курс с таким названием уже есть');
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
  try {
    const { rows } = await pool.query<CourseDbRow>(
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
         END
       WHERE studio_id = $1 AND id = $2
       RETURNING ${COLUMNS}`,
      [
        studioId,
        courseId,
        patch.name ?? null,
        patch.direction ?? null,
        patch.level ?? null,
        patch.kind ?? null,
        patch.defaultDurationMin ?? null,
        patch.capacity ?? null,
        patch.archived ?? null
      ]
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
    }
    return toCourse(row);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'COURSE_NAME_TAKEN', 'Курс с таким названием уже есть');
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
