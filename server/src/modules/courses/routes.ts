import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { errorBody } from '../../errors';
import { requireAccess } from '../access/guard';
import { createCourse, deleteCourse, listCourses, updateCourse } from './repository';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'none'] as const;
const KINDS = ['group', 'individual'] as const;

const baseCourse = {
  name: z.string().min(2).max(140),
  direction: z.string().max(60).optional(),
  level: z.enum(LEVELS),
  kind: z.enum(KINDS),
  defaultDurationMin: z.union([z.literal(45), z.literal(60), z.literal(75), z.literal(90), z.literal(120)]),
  capacity: z.number().int().min(1).max(500)
};

const createBody = z.object(baseCourse);
const patchBody = z
  .object({
    name: baseCourse.name.optional(),
    direction: baseCourse.direction,
    level: baseCourse.level.optional(),
    kind: baseCourse.kind.optional(),
    defaultDurationMin: baseCourse.defaultDurationMin.optional(),
    capacity: baseCourse.capacity.optional(),
    archived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет полей для изменения' });

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

export async function coursesRoutes(app: FastifyInstance, options: { pool: Pool }): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/courses',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const query = request.query as { includeArchived?: string };
      const items = await listCourses(pool, membership.studioId, query.includeArchived === 'true');
      return { items, total: items.length };
    }
  );

  app.post(
    '/studios/:studioId/courses',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
      }

      const course = await createCourse(pool, membership.studioId, parsed.data);
      return reply.code(201).send({ course });
    }
  );

  app.patch(
    '/studios/:studioId/courses/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
      }

      const courseId = (request.params as { courseId: string }).courseId;
      const course = await updateCourse(pool, membership.studioId, courseId, parsed.data);
      return { course };
    }
  );

  app.delete(
    '/studios/:studioId/courses/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const courseId = (request.params as { courseId: string }).courseId;
      await deleteCourse(pool, membership.studioId, courseId);
      return reply.code(204).send();
    }
  );
}

