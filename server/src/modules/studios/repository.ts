import type { Pool, PoolClient } from 'pg';

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
  const client = await pool.connect();
  const hours = input.workingHours ?? defaultWorkingHours();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<StudioRow>(
      `INSERT INTO studios (name, timezone) VALUES ($1, $2)
       RETURNING id, name, timezone, archived_at, created_at`,
      [input.name, input.timezone]
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

export async function getStudio(pool: Pool, studioId: string): Promise<StudioView | null> {
  const { rows } = await pool.query<StudioRow>(
    `SELECT id, name, timezone, archived_at, created_at FROM studios WHERE id = $1`,
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

