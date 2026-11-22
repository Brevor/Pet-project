import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../errors';

export interface MemberRow {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string | null;
  roles: string[];
  status: string;
}

interface MemberDbRow {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  roles: string[];
  status: string;
}

function toMember(row: MemberDbRow): MemberRow {
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roles: row.roles,
    status: row.status
  };
}

export async function listMembers(
  pool: Pool,
  studioId: string,
  filter: { role?: string; q?: string }
): Promise<MemberRow[]> {
  const { rows } = await pool.query<MemberDbRow>(
    `SELECT m.id AS membership_id,
            u.id AS user_id,
            u.email,
            u.display_name,
            m.status,
            COALESCE(array_agg(mr.role ORDER BY mr.role) FILTER (WHERE mr.role IS NOT NULL), '{}') AS roles
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.studio_id = $1
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM membership_roles r WHERE r.membership_id = m.id AND r.role = $2))
        AND ($3::text IS NULL OR u.email ILIKE '%' || $3 || '%'
             OR coalesce(u.display_name, '') ILIKE '%' || $3 || '%')
      GROUP BY m.id, u.id, u.email, u.display_name, m.status
      ORDER BY coalesce(u.display_name, u.email)`,
    [studioId, filter.role ?? null, filter.q ?? null]
  );

  return rows.map(toMember);
}

export interface MembershipRecord {
  membershipId: string;
  userId: string;
  roles: string[];
  status: string;
}

export async function findMembership(
  pool: Pool,
  studioId: string,
  membershipId: string
): Promise<MembershipRecord | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    status: string;
    roles: string[];
  }>(
    `SELECT m.id, m.user_id, m.status,
            COALESCE(array_agg(mr.role ORDER BY mr.role) FILTER (WHERE mr.role IS NOT NULL), '{}') AS roles
       FROM memberships m
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.studio_id = $1 AND m.id = $2
      GROUP BY m.id, m.user_id, m.status`,
    [studioId, membershipId]
  );

  const row = rows[0];
  if (!row) return null;
  return { membershipId: row.id, userId: row.user_id, roles: row.roles, status: row.status };
}

export async function addMember(
  pool: Pool,
  studioId: string,
  userId: string,
  roles: string[]
): Promise<MembershipRecord> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id`,
      [studioId, userId]
    );
    const membershipId = rows[0]!.id;

    for (const role of roles) {
      await client.query(
        `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, $3)`,
        [membershipId, studioId, role]
      );
    }

    await client.query('COMMIT');
    return { membershipId, userId, roles, status: 'active' };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ALREADY_MEMBER', 'Пользователь уже участвует в студии');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function replaceRolesTx(
  client: PoolClient,
  membershipId: string,
  studioId: string,
  roles: string[]
): Promise<void> {
  await client.query(`DELETE FROM membership_roles WHERE membership_id = $1`, [membershipId]);
  for (const role of roles) {
    await client.query(
      `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, $3)`,
      [membershipId, studioId, role]
    );
  }
}

export async function replaceRoles(
  pool: Pool,
  studioId: string,
  membershipId: string,
  roles: string[]
): Promise<void> {
  const current = await findMembership(pool, studioId, membershipId);
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'Участник не найден');
  }
  if (current.roles.includes('owner') && !roles.includes('owner')) {
    throw new AppError(409, 'LAST_OWNER', 'В студии должен остаться владелец');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceRolesTx(client, membershipId, studioId, roles);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeMember(
  pool: Pool,
  studioId: string,
  membershipId: string
): Promise<void> {
  const current = await findMembership(pool, studioId, membershipId);
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'Участник не найден');
  }
  if (current.roles.includes('owner')) {
    throw new AppError(409, 'LAST_OWNER', 'Владельца нельзя исключить: сначала передайте владение');
  }

  await pool.query('DELETE FROM memberships WHERE id = $1 AND studio_id = $2', [
    membershipId,
    studioId
  ]);
}

export async function transferOwnership(
  pool: Pool,
  studioId: string,
  targetMembershipId: string
): Promise<void> {
  const target = await findMembership(pool, studioId, targetMembershipId);
  if (!target || target.status !== 'active') {
    throw new AppError(404, 'NOT_FOUND', 'Участник не найден');
  }
  if (target.roles.includes('owner')) {
    throw new AppError(422, 'ALREADY_OWNER', 'Этот участник уже владелец');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const previous = await client.query<{ membership_id: string }>(
      `SELECT membership_id FROM membership_roles WHERE studio_id = $1 AND role = 'owner'`,
      [studioId]
    );

    for (const row of previous.rows) {
      await client.query(`DELETE FROM membership_roles WHERE membership_id = $1 AND role = 'owner'`, [
        row.membership_id
      ]);
      await client.query(
        `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'admin')
         ON CONFLICT DO NOTHING`,
        [row.membership_id, studioId]
      );
    }

    await client.query(
      `INSERT INTO membership_roles (membership_id, studio_id, role) VALUES ($1, $2, 'owner')`,
      [targetMembershipId, studioId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
