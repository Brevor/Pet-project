import type { Pool } from 'pg';
import { AppError } from '../../errors';

export interface RoomRow {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  archived: boolean;
}

interface RoomDbRow {
  id: string;
  name: string;
  capacity: number;
  description: string | null;
  archived_at: string | null;
}

function toRoom(row: RoomDbRow): RoomRow {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    description: row.description,
    archived: row.archived_at !== null
  };
}

export async function listRooms(
  pool: Pool,
  studioId: string,
  includeArchived: boolean
): Promise<RoomRow[]> {
  const { rows } = await pool.query<RoomDbRow>(
    `SELECT id, name, capacity, description, archived_at
       FROM rooms
      WHERE studio_id = $1 AND ($2::boolean OR archived_at IS NULL)
      ORDER BY name`,
    [studioId, includeArchived]
  );
  return rows.map(toRoom);
}

export async function createRoom(
  pool: Pool,
  studioId: string,
  input: { name: string; capacity: number; description?: string }
): Promise<RoomRow> {
  try {
    const { rows } = await pool.query<RoomDbRow>(
      `INSERT INTO rooms (studio_id, name, capacity, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, capacity, description, archived_at`,
      [studioId, input.name, input.capacity, input.description ?? null]
    );
    return toRoom(rows[0]!);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ROOM_NAME_TAKEN', 'Зал с таким названием уже есть');
    }
    throw error;
  }
}

export async function updateRoom(
  pool: Pool,
  studioId: string,
  roomId: string,
  patch: { name?: string; capacity?: number; description?: string; archived?: boolean }
): Promise<RoomRow> {
  try {
    const { rows } = await pool.query<RoomDbRow>(
      `UPDATE rooms SET
         name = COALESCE($3, name),
         capacity = COALESCE($4, capacity),
         description = COALESCE($5, description),
         archived_at = CASE
           WHEN $6::boolean IS NULL THEN archived_at
           WHEN $6::boolean THEN COALESCE(archived_at, now())
           ELSE NULL
         END
       WHERE studio_id = $1 AND id = $2
       RETURNING id, name, capacity, description, archived_at`,
      [
        studioId,
        roomId,
        patch.name ?? null,
        patch.capacity ?? null,
        patch.description ?? null,
        patch.archived ?? null
      ]
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Зал не найден');
    }
    return toRoom(row);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ROOM_NAME_TAKEN', 'Зал с таким названием уже есть');
    }
    throw error;
  }
}

export async function deleteRoom(pool: Pool, studioId: string, roomId: string): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM class_sessions WHERE studio_id = $1 AND room_id = $2`,
    [studioId, roomId]
  );
  if (Number(rows[0]?.count ?? '0') > 0) {
    throw new AppError(409, 'ROOM_IN_USE', 'У зала есть занятия — архивируйте его вместо удаления');
  }

  const result = await pool.query(`DELETE FROM rooms WHERE studio_id = $1 AND id = $2`, [
    studioId,
    roomId
  ]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Зал не найден');
  }
}
