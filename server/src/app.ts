import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import type { Pool } from 'pg';
import { AppError, errorBody } from './errors';
import { authRoutes } from './modules/auth/routes';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}

export interface BuildAppOptions {
  pool?: Pool;
  jwtSecret?: string;
  jwtExpiresIn?: string;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(jwt, { secret: options.jwtSecret ?? 'test-secret' });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send(errorBody('UNAUTHORIZED', 'Требуется авторизация'));
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  if (options.pool) {
    app.register(authRoutes, {
      pool: options.pool,
      jwtExpiresIn: options.jwtExpiresIn ?? '24h'
    });
  }

  app.setNotFoundHandler(async (request, reply) =>
    reply
      .status(404)
      .send(errorBody('NOT_FOUND', `Маршрут ${request.method} ${request.url} не найден`))
  );

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, error.details));
    }
    return reply.status(500).send(errorBody('INTERNAL', 'Внутренняя ошибка сервера'));
  });

  return app;
}
