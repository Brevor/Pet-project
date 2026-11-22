import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { errorBody } from '../../errors';
import { can, type Action } from './rbac';

export interface MembershipContext {
  membershipId: string;
  studioId: string;
  userId: string;
  roles: string[];
  status: string;
  studioArchived: boolean;
}

interface MembershipRow {
  id: string;
  status: string;
  roles: string[];
  archived_at: Date | null;
}

export async function getMembership(
  pool: Pool,
  studioId: string,
  userId: string
): Promise<MembershipContext | null> {
  const { rows } = await pool.query<MembershipRow>(
    `SELECT m.id,
            m.status,
            s.archived_at,
            COALESCE(array_agg(mr.role ORDER BY mr.role) FILTER (WHERE mr.role IS NOT NULL), '{}') AS roles
       FROM memberships m
       JOIN studios s ON s.id = m.studio_id
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.studio_id = $1 AND m.user_id = $2
      GROUP BY m.id, m.status, s.archived_at`,
    [studioId, userId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    membershipId: row.id,
    studioId,
    userId,
    roles: row.roles,
    status: row.status,
    studioArchived: row.archived_at !== null
  };
}

export function currentUserId(request: FastifyRequest): string | null {
  const user = request.user as { sub?: string } | undefined;
  return user?.sub ?? null;
}

/**
 * Проверяет членство и право. При отказе сам отправляет ответ и возвращает null.
 */
export async function requireAccess(
  pool: Pool,
  request: FastifyRequest,
  reply: FastifyReply,
  action: Action
): Promise<MembershipContext | null> {
  const userId = currentUserId(request);
  if (!userId) {
    reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
    return null;
  }

  const studioId = (request.params as { studioId?: string }).studioId;
  if (!studioId) {
    reply.code(422).send(errorBody('VALIDATION', 'Не указан идентификатор студии'));
    return null;
  }

  const membership = await getMembership(pool, studioId, userId);
  if (!membership || membership.status !== 'active') {
    reply.code(403).send(errorBody('NOT_A_MEMBER', 'Нет доступа к студии'));
    return null;
  }

  if (membership.studioArchived && !membership.roles.includes('owner')) {
    reply
      .code(403)
      .send(errorBody('NOT_A_MEMBER', 'Студия архивирована — доступ есть только у владельца'));
    return null;
  }

  if (!can(membership.roles, action)) {
    reply.code(403).send(errorBody('FORBIDDEN', 'Недостаточно прав'));
    return null;
  }

  return membership;
}
