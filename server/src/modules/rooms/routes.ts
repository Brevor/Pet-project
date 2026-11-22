import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { errorBody } from '../../errors';
import { requireAccess } from '../access/guard';
import { createRoom, deleteRoom, listRooms, updateRoom } from './repository';

const createBody = z.object({
  name: z.string().min(1).max(60),
  capacity: z.number().int().min(1).max(500),
  description: z.string().max(200).optional()
});

const patchBody = z
  .object({
    name: z.string().min(1).max(60).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    description: z.string().max(200).optional(),
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

export async function roomsRoutes(app: FastifyInstance, options: { pool: Pool }): Promise<void> {
  const { pool } = options;

  app.get('/studios/:studioId/rooms', { preHandler: [app.authenticate] }, async (request, reply) => {
    const membership = await requireAccess(pool, request, reply, 'schedule.read');
    if (!membership) return;

    const query = request.query as { includeArchived?: string };
    const items = await listRooms(pool, membership.studioId, query.includeArchived === 'true');
    return { items, total: items.length };
  });

  app.post(
    '/studios/:studioId/rooms',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'rooms.write');
      if (!membership) return;

      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
      }

      const room = await createRoom(pool, membership.studioId, parsed.data);
      return reply.code(201).send({ room });
    }
  );

  app.patch(
    '/studios/:studioId/rooms/:roomId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'rooms.write');
      if (!membership) return;

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
      }

      const roomId = (request.params as { roomId: string }).roomId;
      const room = await updateRoom(pool, membership.studioId, roomId, parsed.data);
      return { room };
    }
  );

  app.delete(
    '/studios/:studioId/rooms/:roomId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'rooms.write');
      if (!membership) return;

      const roomId = (request.params as { roomId: string }).roomId;
      await deleteRoom(pool, membership.studioId, roomId);
      return reply.code(204).send();
    }
  );
}
