import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { requireAccess } from '../access/guard';
import { isRole } from '../access/rbac';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { findUserByEmail, insertUser } from '../auth/repository';
import {
  addMember,
  findMembership,
  listMembers,
  listTeachers,
  removeMember,
  replaceRoles,
  transferOwnership
} from './repository';

const addBody = z.object({
  email: z.string().email(),
  roles: z.array(z.string()).min(1)
});

const rolesBody = z.object({
  roles: z.array(z.string()).min(1)
});

const transferBody = z.object({
  membershipId: z.string().uuid()
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

function assertKnownRoles(roles: string[]): void {
  const unknown = roles.filter((role) => !isRole(role));
  if (unknown.length > 0) {
    throw new AppError(422, 'UNKNOWN_ROLE', `Неизвестные роли: ${unknown.join(', ')}`);
  }
}

export interface MembersRoutesOptions {
  pool: Pool;
}

export async function membersRoutes(
  app: FastifyInstance,
  options: MembersRoutesOptions
): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as { role?: string; q?: string };
      const action = query.role === 'student' ? 'students.write' : 'members.read';
      const membership = await requireAccess(pool, request, reply, action);
      if (!membership) return;

      const items = await listMembers(pool, membership.studioId, {
        role: query.role,
        q: query.q
      });
      return { items, total: items.length };
    }
  );

  app.get(
    '/studios/:studioId/teachers',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const items = await listTeachers(pool, membership.studioId);
      return { items, total: items.length };
    }
  );

  app.post(
    '/studios/:studioId/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = addBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
      }

      try {
        assertKnownRoles(parsed.data.roles);
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorBody(error.code, error.message));
        }
        throw error;
      }

      const onlyStudents = parsed.data.roles.every((role) => role === 'student');
      const membership = await requireAccess(
        pool,
        request,
        reply,
        onlyStudents ? 'students.write' : 'members.write'
      );
      if (!membership) return;

      const existing = await findUserByEmail(pool, parsed.data.email);
      let userId: string;
      let temporaryPassword: string | undefined;

      if (existing) {
        userId = existing.id;
      } else if (onlyStudents) {
        // STF-9: ученика заводит администратор. SMTP нет, поэтому временный пароль
        // возвращается один раз в ответе и должен быть передан ученику лично.
        temporaryPassword = randomBytes(9).toString('base64url');
        const account = await insertUser(pool, {
          email: parsed.data.email,
          passwordHash: await hashPassword(temporaryPassword),
          displayName: parsed.data.email.split('@')[0] ?? null
        });
        userId = account.id;
      } else {
        return reply
          .code(404)
          .send(
            errorBody(
              'USER_NOT_FOUND',
              'Пользователь с таким email не зарегистрирован. Аккаунт создаёт сам пользователь или ИТ-администратор'
            )
          );
      }

      const created = await addMember(pool, membership.studioId, userId, parsed.data.roles);
      const payload: Record<string, unknown> = { membership: created };
      if (temporaryPassword) {
        payload.accountCreated = true;
        payload.temporaryPassword = temporaryPassword;
      }
      return reply.code(201).send(payload);
    }
  );

  app.patch(
    '/studios/:studioId/members/:membershipId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'members.write');
      if (!membership) return;

      const parsed = rolesBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
      }

      try {
        assertKnownRoles(parsed.data.roles);
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorBody(error.code, error.message));
        }
        throw error;
      }

      const targetId = (request.params as { membershipId: string }).membershipId;
      const target = await findMembership(pool, membership.studioId, targetId);
      if (!target) {
        return reply.code(404).send(errorBody('NOT_FOUND', 'Участник не найден'));
      }

      const requesterIsOwner = membership.roles.includes('owner');
      const targetIsOwner = target.roles.includes('owner');

      if (targetId === membership.membershipId) {
        return reply.code(403).send(errorBody('FORBIDDEN', 'Свои роли менять нельзя'));
      }
      if (targetIsOwner && !requesterIsOwner) {
        return reply.code(403).send(errorBody('FORBIDDEN', 'Ролями владельца управляет только владелец'));
      }
      if (parsed.data.roles.includes('owner') && !targetIsOwner) {
        return reply
          .code(403)
          .send(errorBody('FORBIDDEN', 'Владение передаётся только через owner-transfer'));
      }
      if (targetIsOwner && !parsed.data.roles.includes('owner')) {
        return reply
          .code(409)
          .send(errorBody('LAST_OWNER', 'В студии должен остаться владелец'));
      }

      await replaceRoles(pool, membership.studioId, targetId, parsed.data.roles);
      return { membership: await findMembership(pool, membership.studioId, targetId) };
    }
  );

  app.delete(
    '/studios/:studioId/members/:membershipId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'members.write');
      if (!membership) return;

      const targetId = (request.params as { membershipId: string }).membershipId;
      const target = await findMembership(pool, membership.studioId, targetId);
      if (!target) {
        return reply.code(404).send(errorBody('NOT_FOUND', 'Участник не найден'));
      }
      if (target.roles.includes('owner') && !membership.roles.includes('owner')) {
        return reply.code(403).send(errorBody('FORBIDDEN', 'Владельца может исключить только он сам'));
      }

      await removeMember(pool, membership.studioId, targetId);
      return reply.code(204).send();
    }
  );

  app.post(
    '/studios/:studioId/owner-transfer',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'studio.archive');
      if (!membership) return;

      const parsed = transferBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', fieldErrors(parsed.error)));
      }

      await transferOwnership(pool, membership.studioId, parsed.data.membershipId);
      return reply.code(204).send();
    }
  );
}

