import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../errors';

export interface AchievementView {
  achievementId: string;
  name: string;
  description: string | null;
  eventDate: string | null;
  archived: boolean;
  awardedCount: number;
}

interface AchievementRow {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  archived: boolean;
  awarded_count: string;
}

const SELECT_ACHIEVEMENT = `
  SELECT a.id,
         a.name,
         a.description,
         a.event_date::text AS event_date,
         a.archived,
         (SELECT count(*) FROM student_achievements sa
           WHERE sa.achievement_id = a.id AND sa.revoked_at IS NULL) AS awarded_count
    FROM achievements a
   WHERE a.studio_id = $1`;

function toAchievement(row: AchievementRow): AchievementView {
  return {
    achievementId: row.id,
    name: row.name,
    description: row.description,
    eventDate: row.event_date,
    archived: row.archived,
    awardedCount: Number(row.awarded_count)
  };
}

async function findAchievement(
  pool: Pool,
  studioId: string,
  achievementId: string
): Promise<AchievementView | null> {
  const { rows } = await pool.query<AchievementRow>(`${SELECT_ACHIEVEMENT} AND a.id = $2`, [
    studioId,
    achievementId
  ]);
  return rows[0] ? toAchievement(rows[0]) : null;
}

export async function listAchievements(
  pool: Pool,
  studioId: string,
  includeArchived: boolean
): Promise<AchievementView[]> {
  const { rows } = await pool.query<AchievementRow>(
    `${SELECT_ACHIEVEMENT} AND ($2::boolean OR NOT a.archived) ORDER BY a.name`,
    [studioId, includeArchived]
  );
  return rows.map(toAchievement);
}

export interface AchievementInput {
  name: string;
  description: string | null;
  eventDate: string | null;
}

export async function createAchievement(
  pool: Pool,
  studioId: string,
  input: AchievementInput,
  actorUserId: string
): Promise<AchievementView> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO achievements (studio_id, name, description, event_date, created_by)
       VALUES ($1, $2, $3, $4::date, $5)
       RETURNING id`,
      [studioId, input.name, input.description, input.eventDate, actorUserId]
    );
    return (await findAchievement(pool, studioId, rows[0]!.id))!;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'ACHIEVEMENT_NAME_TAKEN', 'Достижение с таким названием уже есть');
    }
    throw error;
  }
}

export interface AchievementPatch {
  name?: string;
  description?: string | null;
  eventDate?: string | null;
  archived?: boolean;
}

export async function updateAchievement(
  pool: Pool,
  studioId: string,
  achievementId: string,
  patch: AchievementPatch
): Promise<AchievementView> {
  const hasDescription = Object.prototype.hasOwnProperty.call(patch, 'description');
  const hasEventDate = Object.prototype.hasOwnProperty.call(patch, 'eventDate');

  try {
    const { rowCount } = await pool.query(
      `UPDATE achievements
          SET name = COALESCE($3, name),
              description = CASE WHEN $4::boolean THEN $5 ELSE description END,
              event_date = CASE WHEN $6::boolean THEN $7::date ELSE event_date END,
              archived = COALESCE($8, archived)
        WHERE studio_id = $1 AND id = $2`,
      [
        studioId,
        achievementId,
        patch.name ?? null,
        hasDescription,
        patch.description ?? null,
        hasEventDate,
        patch.eventDate ?? null,
        patch.archived ?? null
      ]
    );
    if (rowCount === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Достижение не найдено');
    }
    return (await findAchievement(pool, studioId, achievementId))!;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'ACHIEVEMENT_NAME_TAKEN', 'Достижение с таким названием уже есть');
    }
    throw error;
  }
}

export async function deleteAchievement(
  pool: Pool,
  studioId: string,
  achievementId: string
): Promise<void> {
  const awards = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM student_achievements
      WHERE studio_id = $1 AND achievement_id = $2`,
    [studioId, achievementId]
  );
  if (Number(awards.rows[0]?.count ?? '0') > 0) {
    throw new AppError(
      409,
      'ACHIEVEMENT_IN_USE',
      'Достижение уже выдавали — архивируйте его вместо удаления'
    );
  }

  const result = await pool.query('DELETE FROM achievements WHERE studio_id = $1 AND id = $2', [
    studioId,
    achievementId
  ]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Достижение не найдено');
  }
}

export interface StudentAchievementView {
  awardId: string;
  achievementId: string;
  name: string;
  description: string | null;
  eventDate: string | null;
  awardedAt: string;
  comment: string | null;
  revokedAt: string | null;
  awardedByName: string | null;
  revokedByName: string | null;
}

interface StudentAchievementRow {
  id: string;
  achievement_id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  awarded_at: Date;
  comment: string | null;
  revoked_at: Date | null;
  awarded_by_name: string | null;
  revoked_by_name: string | null;
}

function toStudentAchievement(row: StudentAchievementRow): StudentAchievementView {
  return {
    awardId: row.id,
    achievementId: row.achievement_id,
    name: row.name,
    description: row.description,
    eventDate: row.event_date,
    awardedAt: row.awarded_at.toISOString(),
    comment: row.comment,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    awardedByName: row.awarded_by_name,
    revokedByName: row.revoked_by_name
  };
}

export async function listStudentAchievements(
  pool: Pool,
  studioId: string,
  membershipId: string,
  includeRevoked: boolean
): Promise<StudentAchievementView[]> {
  const { rows } = await pool.query<StudentAchievementRow>(
    `SELECT sa.id,
            sa.achievement_id,
            a.name,
            a.description,
            a.event_date::text AS event_date,
            sa.awarded_at,
            sa.comment,
            sa.revoked_at,
            coalesce(au.display_name, au.email) AS awarded_by_name,
            coalesce(ru.display_name, ru.email) AS revoked_by_name
       FROM student_achievements sa
       JOIN achievements a ON a.id = sa.achievement_id
       LEFT JOIN users au ON au.id = sa.awarded_by
       LEFT JOIN users ru ON ru.id = sa.revoked_by
      WHERE sa.studio_id = $1 AND sa.membership_id = $2
        AND ($3::boolean OR sa.revoked_at IS NULL)
      ORDER BY sa.awarded_at DESC`,
    [studioId, membershipId, includeRevoked]
  );
  return rows.map(toStudentAchievement);
}

async function findAward(
  pool: Pool,
  studioId: string,
  membershipId: string,
  awardId: string
): Promise<StudentAchievementView | null> {
  const { rows } = await pool.query<StudentAchievementRow>(
    `SELECT sa.id,
            sa.achievement_id,
            a.name,
            a.description,
            a.event_date::text AS event_date,
            sa.awarded_at,
            sa.comment,
            sa.revoked_at,
            coalesce(au.display_name, au.email) AS awarded_by_name,
            coalesce(ru.display_name, ru.email) AS revoked_by_name
       FROM student_achievements sa
       JOIN achievements a ON a.id = sa.achievement_id
       LEFT JOIN users au ON au.id = sa.awarded_by
       LEFT JOIN users ru ON ru.id = sa.revoked_by
      WHERE sa.studio_id = $1 AND sa.membership_id = $2 AND sa.id = $3`,
    [studioId, membershipId, awardId]
  );
  return rows[0] ? toStudentAchievement(rows[0]) : null;
}

export async function awardAchievement(
  pool: Pool,
  studioId: string,
  membershipId: string,
  achievementId: string,
  comment: string | null,
  actorUserId: string
): Promise<StudentAchievementView> {
  const achievement = await findAchievement(pool, studioId, achievementId);
  if (!achievement) {
    throw new AppError(404, 'NOT_FOUND', 'Достижение не найдено');
  }
  if (achievement.archived) {
    throw new AppError(422, 'ACHIEVEMENT_ARCHIVED', 'Достижение в архиве — выдача запрещена');
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO student_achievements (studio_id, achievement_id, membership_id, awarded_by, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [studioId, achievementId, membershipId, actorUserId, comment]
    );
    return (await findAward(pool, studioId, membershipId, rows[0]!.id))!;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ALREADY_AWARDED', 'Достижение уже выдано этому ученику');
    }
    throw error;
  }
}
export async function revokeAchievement(
  pool: Pool,
  studioId: string,
  membershipId: string,
  awardId: string,
  reason: string | null,
  actorUserId: string
): Promise<void> {
  const result = await pool.query(
    `UPDATE student_achievements
        SET revoked_at = now(), revoked_by = $4, comment = COALESCE($5, comment)
      WHERE studio_id = $1 AND membership_id = $2 AND id = $3 AND revoked_at IS NULL`,
    [studioId, membershipId, awardId, actorUserId, reason]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Выданное достижение не найдено');
  }
}

export async function insertPresetAchievements(
  client: Pool | PoolClient,
  studioId: string,
  userId: string
): Promise<void> {
  const preset = [
    {
      name: 'Первый выход на сцену',
      description: 'Первое выступление перед зрителями'
    },
    {
      name: 'Дебют',
      description: 'Участие в первой постановке студии'
    },
    {
      name: 'Стабильная посещаемость',
      description: 'Месяц занятий без пропусков'
    }
  ];
  for (const item of preset) {
    await client.query(
      `INSERT INTO achievements (studio_id, name, description, created_by) VALUES ($1, $2, $3, $4)`,
      [studioId, item.name, item.description, userId]
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}
