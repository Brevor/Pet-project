import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { listMemberships } from '../access/repository';
import { findUserById, toPublicUser } from './repository';
import { authenticateUser, registerUser } from './service';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80).optional()
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200)
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

export interface AuthRoutesOptions {
  pool: Pool;
  jwtExpiresIn: string;
}

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions
): Promise<void> {
  const { pool } = options;

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
    }

    const user = await registerUser(pool, parsed.data);
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: options.jwtExpiresIn });

    return reply.code(201).send({ token, expiresIn: 86400, user });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
    }

    const user = await authenticateUser(pool, parsed.data.email, parsed.data.password);
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: options.jwtExpiresIn });

    return reply.code(200).send({ token, expiresIn: 86400, user });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request: FastifyRequest) => {
    const userId = (request.user as { sub: string }).sub;
    const row = await findUserById(pool, userId);
    if (!row || !row.is_active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
    }

    const memberships = await listMemberships(pool, userId);
    return { user: toPublicUser(row), memberships };
  });
}
