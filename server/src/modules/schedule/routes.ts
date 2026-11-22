import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { errorBody } from '../../errors';
import { requireAccess } from '../access/guard';
import {
  cancelSession,
  createSeries,
  createSingleSession,
  deleteSeries,
  deleteSession,
  listSchedule,
  updateSession
} from './repository';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');
const timeOnly = z.string().regex(/^\d{2}:\d{2}$/, 'Ожидается время HH:MM');

const singleBody = z.object({
  courseId: z.string().uuid(),
  roomId: z.string().uuid(),
  teacherMembershipId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true })
});

const seriesBody = z.object({
  courseId: z.string().uuid(),
  roomId: z.string().uuid(),
  teacherMembershipId: z.string().uuid().optional(),
  series: z.object({
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    startTime: timeOnly,
    startsOn: dateOnly,
    until: dateOnly
  })
});

const patchBody = z
  .object({
    roomId: z.string().uuid().optional(),
    teacherMembershipId: z.string().uuid().optional(),
    startsAt: z.string().datetime({ offset: true }).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет полей для изменения' });

const scheduleQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  roomId: z.string().uuid().optional(),
  teacherMembershipId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional()
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

function durationFieldErrors(body: unknown): Record<string, string> | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  if ('durationMin' in record) {
    fields.durationMin = 'Длительность задаётся курсом';
  }
  const series = record.series;
  if (typeof series === 'object' && series !== null && 'durationMin' in series) {
    fields['series.durationMin'] = 'Длительность задаётся курсом';
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export async function scheduleRoutes(app: FastifyInstance, options: { pool: Pool }): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/schedule',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const parsed = scheduleQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные параметры', { fields: fieldErrors(parsed.error) }));
      }

      const items = await listSchedule(pool, membership.studioId, parsed.data);
      return { items, total: items.length };
    }
  );

  app.post(
    '/studios/:studioId/sessions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.write');
      if (!membership) return;

      const body = request.body as Record<string, unknown>;
      const forbidden = durationFieldErrors(body);
      if (forbidden) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: forbidden }));
      }
      const isSeries = typeof body === 'object' && body !== null && 'series' in body;

      if (isSeries) {
        const parsed = seriesBody.safeParse(body);
        if (!parsed.success) {
          return reply
            .code(422)
            .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
        }
        const result = await createSeries(pool, membership.studioId, {
          courseId: parsed.data.courseId,
          roomId: parsed.data.roomId,
          teacherMembershipId: parsed.data.teacherMembershipId,
          ...parsed.data.series
        });
        return reply.code(201).send(result);
      }

      const parsed = singleBody.safeParse(body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
      }
      const result = await createSingleSession(pool, membership.studioId, parsed.data);
      return reply.code(201).send(result);
    }
  );

  app.patch(
    '/studios/:studioId/sessions/:sessionId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.write');
      if (!membership) return;

      const forbidden = durationFieldErrors(request.body);
      if (forbidden) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: forbidden }));
      }

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
      }

      const sessionId = (request.params as { sessionId: string }).sessionId;
      const session = await updateSession(pool, membership.studioId, sessionId, parsed.data);
      return { session };
    }
  );

  app.post(
    '/studios/:studioId/sessions/:sessionId/cancel',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.write');
      if (!membership) return;

      const sessionId = (request.params as { sessionId: string }).sessionId;
      await cancelSession(pool, membership.studioId, sessionId);
      return { session: { sessionId, status: 'cancelled' } };
    }
  );

  app.delete(
    '/studios/:studioId/sessions/:sessionId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.write');
      if (!membership) return;

      const sessionId = (request.params as { sessionId: string }).sessionId;
      await deleteSession(pool, membership.studioId, sessionId);
      return reply.code(204).send();
    }
  );

  app.delete(
    '/studios/:studioId/series/:seriesId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.write');
      if (!membership) return;

      const query = request.query as { futureOnly?: string };
      const seriesId = (request.params as { seriesId: string }).seriesId;
      const deleted = await deleteSeries(
        pool,
        membership.studioId,
        seriesId,
        query.futureOnly !== 'false'
      );
      return { deleted };
    }
  );
}
