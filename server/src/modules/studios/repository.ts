import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../errors';
import { generateReferralCode } from './referral';

function isReferralCodeCollision(error: unknown): boolean {
  const err = error as { code?: string; constraint?: string };
  return err.code === '23505' && err.constraint === 'studios_referral_code_key';
}

export interface WorkingHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface StudioRow {
  id: string;
  name: string;
  timezone: string;
  referral_code: string;
  archived_at: string | null;
  created_at: string;
}

export interface StudioView {
  studio: StudioRow;
  workingHours: WorkingHour[];
}

export function defaultWorkingHours(): WorkingHour[] {
  return Array.from({ length: 7 }, (_, index) => ({
    weekday: index + 1,
    opensAt: '09:00',
    closesAt: '22:00',
    isClosed: index === 6
  }));
}

async function insertHours(
  client: Pool | PoolClient,
  studioId: string,
  hours: WorkingHour[]
): Promise<void> {
  for (const hour of hours) {
    await client.query(
      `INSERT INTO studio_working_hours (studio_id, weekday, opens_at, closes_at, is_closed)
       VALUES ($1, $2, $3, $4, $5)`,
      [studioId, hour.weekday, hour.opensAt, hour.closesAt, hour.isClosed]
    );
  }
}

export async function createStudioWithOwner(
  pool: Pool,
  userId: string,
  input: { name: string; timezone: string; workingHours?: WorkingHour[] }
): Promise<StudioView> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await createStudioTx(pool, userId, input);
    } catch (error) {
      if (isReferralCodeCollision(error) && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError(500, 'INTERNAL', 'Не удалось сгенерировать уникальный код студии');
}

async function createStudioTx(
  pool: Pool,
  userId: string,
  input: { name: string; timezone: string; workingHours?: WorkingHour[] }
): Promise<StudioView> {
  const client = await pool.connect();
  const hours = input.workingHours ?? defaultWorkingHours();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<StudioRow>(
      `INSERT INTO studios (name, timezone, referral_code) VALUES ($1, $2, $3)
       RETURNING id, name, timezone, referral_code, archived_at, created_at`,
      [input.name, input.timezone, generateReferralCode()]
    );
    const studio = rows[0]!;

    await insertHours(client, studio.id, hours);

    const membership = await client.query<{ id: string }>(
      `INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id`,
      [studio.id, userId]
    );

    await client.query(
      `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'owner')`,
      [membership.rows[0]!.id, studio.id]
    );

    await client.query('COMMIT');
    return { studio, workingHours: hours };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateReferralCode(
  pool: Pool,
  studioId: string,
  code: string
): Promise<string> {
  try {
    const { rows } = await pool.query<{ referral_code: string }>(
      `UPDATE studios SET referral_code = $2 WHERE id = $1 RETURNING referral_code`,
      [studioId, code]
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Студия не найдена');
    }
    return row.referral_code;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'REFERRAL_TAKEN', 'Такой код уже занят другой студией');
    }
    throw error;
  }
}

export async function findStudioByReferralCode(
  pool: Pool,
  code: string
): Promise<{ id: string; name: string; referral_code: string } | null> {
  const { rows } = await pool.query<{ id: string; name: string; referral_code: string }>(
    `SELECT id, name, referral_code
       FROM studios
      WHERE lower(referral_code) = lower($1) AND archived_at IS NULL`,
    [code]
  );
  return rows[0] ?? null;
}

export async function getStudio(pool: Pool, studioId: string): Promise<StudioView | null> {
  const { rows } = await pool.query<StudioRow>(
    `SELECT id, name, timezone, referral_code, archived_at, created_at FROM studios WHERE id = $1`,
    [studioId]
  );
  const studio = rows[0];
  if (!studio) {
    return null;
  }

  const hours = await pool.query<{
    weekday: number;
    opens_at: string;
    closes_at: string;
    is_closed: boolean;
  }>(
    `SELECT weekday, opens_at, closes_at, is_closed
       FROM studio_working_hours WHERE studio_id = $1 ORDER BY weekday`,
    [studioId]
  );

  return {
    studio,
    workingHours: hours.rows.map((row) => ({
      weekday: row.weekday,
      opensAt: String(row.opens_at).slice(0, 5),
      closesAt: String(row.closes_at).slice(0, 5),
      isClosed: row.is_closed
    }))
  };
}

export async function updateStudio(
  pool: Pool,
  studioId: string,
  patch: { name?: string; timezone?: string; workingHours?: WorkingHour[] }
): Promise<StudioView | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (patch.name !== undefined || patch.timezone !== undefined) {
      await client.query(
        `UPDATE studios SET name = COALESCE($2, name), timezone = COALESCE($3, timezone)
          WHERE id = $1`,
        [studioId, patch.name ?? null, patch.timezone ?? null]
      );
    }

    if (patch.workingHours) {
      await client.query('DELETE FROM studio_working_hours WHERE studio_id = $1', [studioId]);
      await insertHours(client, studioId, patch.workingHours);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getStudio(pool, studioId);
}

export async function archiveStudio(pool: Pool, studioId: string): Promise<void> {
  await pool.query(`UPDATE studios SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`, [
    studioId
  ]);
}

