import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { errorBody } from '../../errors';
import { currentUserId } from '../access/guard';
import { registerUser } from '../auth/service';
import { getStudioByCode, joinAsStudent } from './repository';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80).optional()
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

export interface JoinRoutesOptions {
  pool: Pool;
  jwtExpiresIn: string;
}

export async function joinRoutes(
  app: FastifyInstance,
  options: JoinRoutesOptions
): Promise<void> {
  const { pool } = options;

  app.get('/join/:code', async (request) => {
    const code = (request.params as { code: string }).code;
    const studio = await getStudioByCode(pool, code);
    return { studio: { id: studio.id, name: studio.name, referralCode: studio.referral_code } };
  });

  app.post('/join/:code/register', async (request, reply) => {
    const code = (request.params as { code: string }).code;
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
    }

    const studio = await getStudioByCode(pool, code);
    const user = await registerUser(pool, parsed.data);
    const membership = await joinAsStudent(pool, studio.id, user.id);

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: options.jwtExpiresIn });

    return reply.code(201).send({
      token,
      expiresIn: 86400,
      user,
      studio: { id: studio.id, name: studio.name, referralCode: studio.referral_code },
      membership
    });
  });

  app.post(
    '/join/:code/join',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const code = (request.params as { code: string }).code;
      const userId = currentUserId(request)!;

      const studio = await getStudioByCode(pool, code);
      const membership = await joinAsStudent(pool, studio.id, userId);

      return reply.code(201).send({
        membership,
        studio: { id: studio.id, name: studio.name, referralCode: studio.referral_code }
      });
    }
  );
}
