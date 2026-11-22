import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { errorBody } from '../../errors';
import { listMemberships } from '../access/repository';
import { currentUserId, requireAccess } from '../access/guard';
import { archiveStudio, createStudioWithOwner, getStudio, updateStudio } from './repository';

const hourSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  isClosed: z.boolean().optional().default(false)
});

const createBody = z.object({
  name: z.string().min(2).max(60),
  timezone: z.string().min(3).max(64).default('Europe/Moscow'),
  workingHours: z.array(hourSchema).length(7).optional()
});

const patchBody = z
  .object({
    name: z.string().min(2).max(60).optional(),
    timezone: z.string().min(3).max(64).optional(),
    workingHours: z.array(hourSchema).length(7).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет полей для изменения' });

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

export interface StudiosRoutesOptions {
  pool: Pool;
}

export async function studiosRoutes(
  app: FastifyInstance,
  options: StudiosRoutesOptions
): Promise<void> {
  const { pool } = options;

  app.get('/studios', { preHandler: [app.authenticate] }, async (request) => {
    const userId = currentUserId(request)!;
    const items = await listMemberships(pool, userId);
    return { items };
  });

  app.post('/studios', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
    }

    const view = await createStudioWithOwner(pool, currentUserId(request)!, parsed.data);
    return reply.code(201).send({ ...view, myRoles: ['owner'] });
  });

  app.get('/studios/:studioId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const membership = await requireAccess(pool, request, reply, 'studio.read');
    if (!membership) return;

    const view = await getStudio(pool, membership.studioId);
    if (!view) {
      return reply.code(404).send(errorBody('NOT_FOUND', 'Студия не найдена'));
    }
    return { ...view, myRoles: membership.roles };
  });

  app.patch('/studios/:studioId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const membership = await requireAccess(pool, request, reply, 'studio.write');
    if (!membership) return;

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
    }

    const view = await updateStudio(pool, membership.studioId, parsed.data);
    if (!view) {
      return reply.code(404).send(errorBody('NOT_FOUND', 'Студия не найдена'));
    }
    return { ...view, myRoles: membership.roles };
  });

  app.post(
    '/studios/:studioId/archive',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'studio.archive');
      if (!membership) return;

      await archiveStudio(pool, membership.studioId);
      return reply.code(204).send();
    }
  );
}
