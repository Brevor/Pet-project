import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { requireAccess } from '../access/guard';

const groupBody = z.object({ name: z.string().trim().min(2).max(80) });
const patchBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  archived: z.boolean().optional()
});
const memberBody = z.object({ membershipId: z.string().uuid() });

interface GroupRow {
  id: string;
  course_id: string;
  name: string;
  archived: boolean;
  member_count: string;
}

function toGroup(row: GroupRow) {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    archived: row.archived,
    memberCount: Number(row.member_count)
  };
}

const GROUP_SELECT = `
  SELECT g.id, g.course_id, g.name, g.archived,
         (SELECT count(*) FROM course_group_members m WHERE m.group_id = g.id) AS member_count
    FROM course_groups g
   WHERE g.studio_id = $1`;

export async function groupsRoutes(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const { pool } = options;

  app.get(
    '/studios/:studioId/courses/:courseId/groups',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId } = request.params as { studioId: string; courseId: string };
      const membership = await requireAccess(pool, request, reply, 'schedule.read');
      if (!membership) return;

      const { rows } = await pool.query<GroupRow>(
        `${GROUP_SELECT} AND g.course_id = $2 ORDER BY g.name`,
        [membership.studioId, courseId]
      );
      return { items: rows.map(toGroup), total: rows.length };
    }
  );

  app.post(
    '/studios/:studioId/courses/:courseId/groups',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId } = request.params as { studioId: string; courseId: string };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const parsed = groupBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send(
          errorBody('VALIDATION', 'Некорректное название группы', {
            fields: { name: 'От 2 до 80 символов' }
          })
        );
      }

      try {
        const { rows } = await pool.query<GroupRow>(
          `INSERT INTO course_groups (studio_id, course_id, name)
           VALUES ($1, $2, $3)
           RETURNING id, course_id, name, archived, 0 AS member_count`,
          [membership.studioId, courseId, parsed.data.name]
        );
        return reply.code(201).send({ group: toGroup(rows[0]!) });
      } catch (cause) {
        const code = (cause as { code?: string }).code;
        if (code === '23505') {
          throw new AppError(409, 'GROUP_NAME_TAKEN', 'Такая группа уже есть в курсе');
        }
        if (code === '23503') {
          throw new AppError(404, 'NOT_FOUND', 'Курс не найден');
        }
        throw cause;
      }
    }
  );

  app.patch(
    '/studios/:studioId/courses/:courseId/groups/:groupId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId, groupId } = request.params as {
        studioId: string;
        courseId: string;
        groupId: string;
      };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const parsed = patchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные группы', { fields: { name: '2–80' } }));
      }
      const was = await pool.query<GroupRow>(
        `${GROUP_SELECT} AND g.course_id = $2 AND g.id = $3`,
        [membership.studioId, courseId, groupId]
      );
      if (was.rows.length === 0) {
        throw new AppError(404, 'NOT_FOUND', 'Группа не найдена');
      }

      try {
        await pool.query(
          `UPDATE course_groups SET name = coalesce($4, name), archived = coalesce($5, archived)
            WHERE studio_id = $1 AND course_id = $2 AND id = $3`,
          [membership.studioId, courseId, groupId, parsed.data.name ?? null, parsed.data.archived ?? null]
        );
        const { rows } = await pool.query<GroupRow>(
          `${GROUP_SELECT} AND g.course_id = $2 AND g.id = $3`,
          [membership.studioId, courseId, groupId]
        );
        return { group: toGroup(rows[0]!) };
      } catch (cause) {
        if ((cause as { code?: string }).code === '23505') {
          throw new AppError(409, 'GROUP_NAME_TAKEN', 'Такая группа уже есть в курсе');
        }
        throw cause;
      }
    }
  );

  app.delete(
    '/studios/:studioId/courses/:courseId/groups/:groupId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId, groupId } = request.params as {
        studioId: string;
        courseId: string;
        groupId: string;
      };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const result = await pool.query(
        'DELETE FROM course_groups WHERE studio_id = $1 AND course_id = $2 AND id = $3',
        [membership.studioId, courseId, groupId]
      );
      if (result.rowCount === 0) {
        throw new AppError(404, 'NOT_FOUND', 'Группа не найдена');
      }
      return reply.code(204).send();
    }
  );

  app.get(
    '/studios/:studioId/courses/:courseId/groups/:groupId/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId, groupId } = request.params as {
        studioId: string;
        courseId: string;
        groupId: string;
      };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const group = await pool.query(
        'SELECT 1 FROM course_groups WHERE studio_id = $1 AND course_id = $2 AND id = $3',
        [membership.studioId, courseId, groupId]
      );
      if (group.rows.length === 0) {
        throw new AppError(404, 'NOT_FOUND', 'Группа не найдена');
      }

      const { rows } = await pool.query<{
        membership_id: string;
        display_name: string;
      }>(
        `SELECT m.id AS membership_id,
                coalesce(u.display_name, u.email) AS display_name
           FROM course_group_members g
           JOIN memberships m ON m.id = g.membership_id
           JOIN users u ON u.id = m.user_id
          WHERE g.studio_id = $1 AND g.course_id = $2 AND g.group_id = $3
          ORDER BY display_name`,
        [membership.studioId, courseId, groupId]
      );
      return {
        items: rows.map((row) => ({
          membershipId: row.membership_id,
          displayName: row.display_name
        })),
        total: rows.length
      };
    }
  );
  app.post(
    '/studios/:studioId/courses/:courseId/groups/:groupId/members',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId, groupId } = request.params as {
        studioId: string;
        courseId: string;
        groupId: string;
      };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const parsed = memberBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректный участник', { fields: { membershipId: 'uuid' } }));
      }

      const student = await pool.query(
        `SELECT 1 FROM memberships m
          WHERE m.studio_id = $1 AND m.id = $2 AND m.status = 'active'
            AND EXISTS (SELECT 1 FROM membership_roles r WHERE r.membership_id = m.id AND r.role = 'student')`,
        [membership.studioId, parsed.data.membershipId]
      );
      if (student.rows.length === 0) {
        throw new AppError(422, 'NOT_A_STUDENT', 'Участник не является учеником студии');
      }

      const taken = await pool.query(
        `SELECT 1 FROM course_group_members m
           JOIN course_groups g ON g.id = m.group_id
          WHERE m.membership_id = $1 AND g.course_id = $2`,
        [parsed.data.membershipId, courseId]
      );
      if (taken.rows.length > 0) {
        throw new AppError(409, 'ALREADY_IN_COURSE_GROUP', 'Ученик уже в группе этого курса');
      }

      const group = await pool.query<{ id: string }>(
        'SELECT id FROM course_groups WHERE studio_id = $1 AND course_id = $2 AND id = $3',
        [membership.studioId, courseId, groupId]
      );
      if (group.rows.length === 0) {
        throw new AppError(404, 'NOT_FOUND', 'Группа не найдена');
      }

      try {
        await pool.query(
          `INSERT INTO course_group_members (studio_id, group_id, course_id, membership_id)
           VALUES ($1, $2, $3, $4)`,
          [membership.studioId, groupId, courseId, parsed.data.membershipId]
        );
      } catch (cause) {
        if ((cause as { code?: string }).code === '23505') {
          throw new AppError(409, 'ALREADY_IN_COURSE_GROUP', 'Ученик уже в группе этого курса');
        }
        throw cause;
      }
      return reply.code(204).send();
    }
  );

  app.delete(
    '/studios/:studioId/courses/:courseId/groups/:groupId/members/:membershipId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId, groupId, membershipId } = request.params as {
        studioId: string;
        courseId: string;
        groupId: string;
        membershipId: string;
      };
      const membership = await requireAccess(pool, request, reply, 'courses.write');
      if (!membership) return;

      const result = await pool.query(
        `DELETE FROM course_group_members
          WHERE studio_id = $1 AND course_id = $2 AND group_id = $3 AND membership_id = $4`,
        [membership.studioId, courseId, groupId, membershipId]
      );
      if (result.rowCount === 0) {
        throw new AppError(404, 'NOT_FOUND', 'Ученик не найден в группе');
      }
      return reply.code(204).send();
    }
  );
}
