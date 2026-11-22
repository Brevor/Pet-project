import type { Pool } from 'pg';
import { AppError } from '../../errors';
import { findStudioByReferralCode } from '../studios/repository';

export interface JoinStudio {
  id: string;
  name: string;
  referral_code: string;
}

export async function getStudioByCode(pool: Pool, code: string): Promise<JoinStudio> {
  const studio = await findStudioByReferralCode(pool, code);
  if (!studio) {
    throw new AppError(404, 'REFERRAL_NOT_FOUND', 'Ссылка не найдена или устарела');
  }
  return studio;
}

export interface JoinedMembership {
  membershipId: string;
  roles: string[];
  status: string;
}

export async function joinAsStudent(
  pool: Pool,
  studioId: string,
  userId: string
): Promise<JoinedMembership> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO memberships (studio_id, user_id) VALUES ($1, $2) RETURNING id`,
      [studioId, userId]
    );
    const membershipId = rows[0]!.id;

    await client.query(
      `INSERT INTO membership_roles (membership_id, studio_id, role)
       VALUES ($1, $2, 'student')`,
      [membershipId, studioId]
    );

    await client.query('COMMIT');
    return { membershipId, roles: ['student'], status: 'active' };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'ALREADY_MEMBER', 'Вы уже участник этой студии');
    }
    throw error;
  } finally {
    client.release();
  }
}
