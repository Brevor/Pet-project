import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { currentUserId, requireAccess } from '../access/guard';
import { can } from '../access/rbac';
import { findMembership } from '../members/repository';
import {
  awardAchievement,
  createAchievement,
  deleteAchievement,
  listAchievements,
  listStudentAchievements,
  revokeAchievement,
  updateAchievement
} from './repository';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

const createBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  eventDate: dateOnly.optional()
});

const patchBody = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    eventDate: dateOnly.nullable().optional(),
    archived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет полей для изменения' });

const awardBody = z.object({
  achievementId: z.string().uuid(),
  comment: z.string().trim().max(300).optional()
});

const revokeBody = z.object({
  reason: z.string().trim().max(300).optional()
});

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

function validationError(reply: FastifyReply, message: string, error: z.ZodError) {
  return reply.code(422).send(errorBody('VALIDATION', message, { fields: fieldErrors(error) }));
}

async function findStudent(pool: Pool, studioId: string, membershipId: string) {
  const target = await findMembership(pool, studioId, membershipId);
  if (!target || target.status !== 'active' || !target.roles.includes('student')) {
    return null;
  }
  return target;
}

export async function achievementsRoutes(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/achievements',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'members.list');
      if (!membership) return;

      const query = request.query as { includeArchived?: string };
      const items = await listAchievements(
        pool,
        membership.studioId,
        query.includeArchived === 'true'
      );
      return { items, total: items.length };
    }
  );

  app.post(
    '/studios/:studioId/achievements',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'achievements.write');
      if (!membership) return;
      if (membership.studioArchived) {
        return reply
          .code(403)
          .send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — изменения запрещены'));
      }

      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return validationError(reply, 'Некорректные данные достижения', parsed.error);
      }
      const actorUserId = currentUserId(request);
      if (!actorUserId) {
        return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
      }

      const achievement = await createAchievement(
        pool,
        membership.studioId,
        {
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          eventDate: parsed.data.eventDate ?? null
        },
        actorUserId
      );
      return reply.code(201).send({ achievement });
    }
  );

  app.patch(
    '/studios/:studioId/achievements/:achievementId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'achievements.write');
      if (!membership) return;
      if (membership.studioArchived) {
        return reply
          .code(403)
          .send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — изменения запрещены'));
      }

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return validationError(reply, 'Некорректные данные достижения', parsed.error);
      }

      const { achievementId } = request.params as { studioId: string; achievementId: string };
      const achievement = await updateAchievement(pool, membership.studioId, achievementId, parsed.data);
      return { achievement };
    }
  );

  app.delete(
    '/studios/:studioId/achievements/:achievementId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'achievements.write');
      if (!membership) return;

      const { achievementId } = request.params as { studioId: string; achievementId: string };
      await deleteAchievement(pool, membership.studioId, achievementId);
      return reply.code(204).send();
    }
  );

  app.get(
    '/studios/:studioId/students/:membershipId/achievements',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'studio.read');
      if (!membership) return;

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      const staff = can(membership.roles, 'members.list');
      if (!staff && membershipId !== membership.membershipId) {
        return forbidden(reply, 'Достижения других учеников недоступны');
      }
      if (!(await findStudent(pool, membership.studioId, membershipId))) {
        throw new AppError(404, 'NOT_FOUND', 'Ученик не найден');
      }

      const query = request.query as { includeRevoked?: string };
      const items = await listStudentAchievements(
        pool,
        membership.studioId,
        membershipId,
        staff && query.includeRevoked === 'true'
      );
      return { items, total: items.length };
    }
  );

  app.post(
    '/studios/:studioId/students/:membershipId/achievements',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'achievements.write');
      if (!membership) return;
      if (membership.studioArchived) {
        return reply
          .code(403)
          .send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — изменения запрещены'));
      }

      const parsed = awardBody.safeParse(request.body);
      if (!parsed.success) {
        return validationError(reply, 'Некорректные данные выдачи', parsed.error);
      }

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      if (!(await findStudent(pool, membership.studioId, membershipId))) {
        throw new AppError(422, 'NOT_A_STUDENT', 'Участник не является учеником студии');
      }
      const actorUserId = currentUserId(request);
      if (!actorUserId) {
        return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
      }

      const award = await awardAchievement(
        pool,
        membership.studioId,
        membershipId,
        parsed.data.achievementId,
        parsed.data.comment ?? null,
        actorUserId
      );
      return reply.code(201).send({ award });
    }
  );

  app.delete(
    '/studios/:studioId/students/:membershipId/achievements/:awardId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'achievements.write');
      if (!membership) return;

      const parsed = revokeBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return validationError(reply, 'Некорректный комментарий отзыва', parsed.error);
      }

      const { membershipId, awardId } = request.params as {
        studioId: string;
        membershipId: string;
        awardId: string;
      };
      const actorUserId = currentUserId(request);
      if (!actorUserId) {
        return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
      }

      await revokeAchievement(
        pool,
        membership.studioId,
        membershipId,
        awardId,
        parsed.data.reason ?? null,
        actorUserId
      );
      return reply.code(204).send();
    }
  );
}
