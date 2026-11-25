import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { currentUserId, requireAccess } from '../access/guard';
import { can } from '../access/rbac';
import { findMembership } from '../members/repository';
import { computeBalance, listBalanceOperations, topUp } from './repository';

const topupBody = z.object({
  lessons: z.number().int().min(1).max(999),
  comment: z.string().trim().max(300).optional(),
  expiresInMonths: z.number().int().min(1).max(36).optional()
});

const operationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

const STAFF_ROLES = ['owner', 'admin', 'curator'];

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

function forbidden(reply: FastifyReply, message: string) {
  return reply.code(403).send(errorBody('FORBIDDEN', message));
}

function isStaff(roles: readonly string[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

async function findStudent(pool: Pool, studioId: string, membershipId: string) {
  const target = await findMembership(pool, studioId, membershipId);
  if (!target || target.status !== 'active' || !target.roles.includes('student')) {
    return null;
  }
  return target;
}

export async function balanceRoutes(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/students/:membershipId/balance',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      if (!can(membership.roles, 'balance.read')) {
        return forbidden(reply, 'Недостаточно прав');
      }
      if (!isStaff(membership.roles) && membershipId !== membership.membershipId) {
        return forbidden(reply, 'Чужой баланс недоступен');
      }

      if (!(await findStudent(pool, membership.studioId, membershipId))) {
        throw new AppError(404, 'NOT_FOUND', 'Ученик не найден');
      }

      const balance = await computeBalance(pool, membership.studioId, membershipId);
      return { membershipId, balance };
    }
  );

  app.get(
    '/studios/:studioId/students/:membershipId/balance/operations',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      if (!can(membership.roles, 'balance.read')) {
        return forbidden(reply, 'Недостаточно прав');
      }
      if (!isStaff(membership.roles) && membershipId !== membership.membershipId) {
        return forbidden(reply, 'Чужие операции недоступны');
      }

      if (!(await findStudent(pool, membership.studioId, membershipId))) {
        throw new AppError(404, 'NOT_FOUND', 'Ученик не найден');
      }

      const parsed = operationsQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные параметры', { fields: fieldErrors(parsed.error) }));
      }

      return await listBalanceOperations(
        pool,
        membership.studioId,
        membershipId,
        parsed.data.page,
        parsed.data.perPage
      );
    }
  );

  app.post(
    '/studios/:studioId/students/:membershipId/balance/topups',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'balance.write');
      if (!membership) return;
      if (membership.studioArchived) {
        return reply
          .code(403)
          .send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — начисления запрещены'));
      }

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      if (!(await findStudent(pool, membership.studioId, membershipId))) {
        throw new AppError(422, 'NOT_A_STUDENT', 'Участник не является учеником студии');
      }

      const parsed = topupBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные пакета', { fields: fieldErrors(parsed.error) }));
      }

      const actorUserId = currentUserId(request);
      if (!actorUserId) {
        return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
      }

      const result = await topUp(pool, {
        studioId: membership.studioId,
        membershipId,
        lessons: parsed.data.lessons,
        comment: parsed.data.comment ?? null,
        expiresInMonths: parsed.data.expiresInMonths ?? null,
        actorUserId
      });
      return reply.code(201).send({ operation: result.operation, balance: result.balance });
    }
  );
}
