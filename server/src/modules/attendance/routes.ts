import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { can } from '../access/rbac';
import { currentUserId, requireAccess } from '../access/guard';
import {
  ATTENDANCE_STATUSES,
  createAttendance,
  getSessionAttendanceContext,
  isInRoster,
  isStudentMember,
  listSessionAttendance,
  listStudentAttendance,
  updateAttendance
} from './repository';

const statusEnum = z.enum(ATTENDANCE_STATUSES);

const markBody = z.object({
  membershipId: z.string().uuid().optional(),
  status: statusEnum.optional()
});

const patchBody = z.object({
  status: statusEnum,
  reason: z.string().trim().max(300).optional()
});

const historyQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
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

export async function attendanceRoutes(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/sessions/:sessionId/attendance',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const manages = can(membership.roles, 'attendance.manage');
      const isStudent = membership.roles.includes('student');
      if (!manages && !isStudent) {
        return forbidden(reply, 'Недостаточно прав');
      }

      const { sessionId } = request.params as { studioId: string; sessionId: string };
      const session = await getSessionAttendanceContext(pool, membership.studioId, sessionId);
      if (!session) {
        throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
      }

      const items = await listSessionAttendance(
        pool,
        membership.studioId,
        sessionId,
        session.courseId,
        manages ? undefined : membership.membershipId
      );
      return {
        items,
        total: items.length,
        session: { sessionId: session.sessionId, status: session.status, startsAt: session.startsAt }
      };
    }
  );

  app.post(
    '/studios/:studioId/sessions/:sessionId/attendance',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;
      if (membership.studioArchived) {
        return reply.code(403).send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — отметки запрещены'));
      }

      const manages = can(membership.roles, 'attendance.manage');
      const isStudent = membership.roles.includes('student');
      if (!manages && !isStudent) {
        return forbidden(reply, 'Недостаточно прав');
      }

      const parsed = markBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные отметки', { fields: fieldErrors(parsed.error) }));
      }

      const { sessionId } = request.params as { studioId: string; sessionId: string };
      const session = await getSessionAttendanceContext(pool, membership.studioId, sessionId);
      if (!session) {
        throw new AppError(404, 'NOT_FOUND', 'Сеанс не найден');
      }
      if (session.studioArchived) {
        return reply.code(403).send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — отметки запрещены'));
      }
      if (session.status === 'cancelled') {
        throw new AppError(409, 'SESSION_CANCELLED', 'Сеанс отменён — отметки запрещены');
      }

      const status = parsed.data.status ?? 'attended';
      const targetMembershipId = parsed.data.membershipId ?? membership.membershipId;
      if (manages) {
        if (!parsed.data.membershipId) {
          return reply.code(422).send(
            errorBody('VALIDATION', 'Не указан ученик', {
              fields: { membershipId: 'Обязательно для администратора' }
            })
          );
        }
        if (!(await isStudentMember(pool, membership.studioId, parsed.data.membershipId))) {
          throw new AppError(422, 'NOT_A_STUDENT', 'Участник не является учеником студии');
        }
        if (!session.afterStudioCreated) {
          throw new AppError(
            422,
            'BEFORE_STUDIO_CREATED',
            'Нельзя отметить посещение раньше даты создания студии'
          );
        }
      } else {
        if (targetMembershipId !== membership.membershipId) {
          return forbidden(reply, 'Можно отметить только себя');
        }
        if (status === 'no_show') {
          return forbidden(reply, 'Ученик может поставить только «пришёл» или «отменил»');
        }
        if (!(await isInRoster(pool, membership.studioId, session.courseId, membership.membershipId))) {
          throw new AppError(403, 'NOT_IN_ROSTER', 'Ученик не входит в группу курса сеанса');
        }
        if (status === 'attended' && !session.withinCheckIn) {
          throw new AppError(
            409,
            'CHECKIN_WINDOW_CLOSED',
            'Самоотметка доступна с начала сеанса до +120 минут'
          );
        }
        if (status === 'cancelled' && !session.beforeStart) {
          throw new AppError(
            409,
            'CANCEL_WINDOW_CLOSED',
            'Отменить участие можно только до начала сеанса'
          );
        }
      }

      const attendance = await createAttendance(pool, {
        studioId: membership.studioId,
        sessionId,
        membershipId: targetMembershipId,
        status,
        actorUserId: manages ? currentUserId(request) : null
      });
      return reply.code(201).send({ attendance });
    }
  );

  app.patch(
    '/studios/:studioId/attendance/:attendanceId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;
      if (!can(membership.roles, 'attendance.manage')) {
        return forbidden(reply, 'Недостаточно прав');
      }
      if (membership.studioArchived) {
        return reply.code(403).send(errorBody('STUDIO_ARCHIVED', 'Студия в архиве — отметки запрещены'));
      }

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные отметки', { fields: fieldErrors(parsed.error) }));
      }

      const actorUserId = currentUserId(request);
      if (!actorUserId) {
        return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
      }

      const { attendanceId } = request.params as { studioId: string; attendanceId: string };
      const attendance = await updateAttendance(pool, {
        studioId: membership.studioId,
        attendanceId,
        status: parsed.data.status,
        reason: parsed.data.reason ?? null,
        actorUserId
      });
      return { attendance };
    }
  );

  app.get(
    '/studios/:studioId/students/:membershipId/attendance',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const { membershipId } = request.params as { studioId: string; membershipId: string };
      const manages = can(membership.roles, 'attendance.manage');
      if (!manages && membershipId !== membership.membershipId) {
        return forbidden(reply, 'Чужие посещения недоступны');
      }

      if (!(await isStudentMember(pool, membership.studioId, membershipId))) {
        throw new AppError(404, 'NOT_FOUND', 'Ученик не найден');
      }

      const parsed = historyQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные параметры', { fields: fieldErrors(parsed.error) }));
      }

      return await listStudentAttendance(
        pool,
        membership.studioId,
        membershipId,
        parsed.data.page,
        parsed.data.perPage,
        manages
      );
    }
  );
}
