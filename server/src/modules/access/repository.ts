import type { Pool } from 'pg';

export interface MembershipInfo {
  membershipId: string;
  studioId: string;
  studioName: string;
  roles: string[];
  status: string;
}

interface MembershipRow {
  membership_id: string;
  studio_id: string;
  studio_name: string;
  status: string;
  roles: string[];
}

/**
 * Членства пользователя с ролями. Работает без studioId — это «мои студии»,
 * студийные репозитории появятся с M3.
 */
export async function listMemberships(pool: Pool, userId: string): Promise<MembershipInfo[]> {
  const { rows } = await pool.query<MembershipRow>(
    `SELECT m.id AS membership_id,
            m.studio_id,
            s.name AS studio_name,
            m.status,
            COALESCE(array_agg(mr.role ORDER BY mr.role) FILTER (WHERE mr.role IS NOT NULL), '{}') AS roles
       FROM memberships m
       JOIN studios s ON s.id = m.studio_id
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.user_id = $1
      GROUP BY m.id, m.studio_id, s.name, m.status
      ORDER BY s.name`,
    [userId]
  );

  return rows.map((row) => ({
    membershipId: row.membership_id,
    studioId: row.studio_id,
    studioName: row.studio_name,
    roles: row.roles,
    status: row.status
  }));
}
