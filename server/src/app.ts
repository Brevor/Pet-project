import Fastify, { type FastifyInstance } from 'fastify';
import { AppError, errorBody } from './errors';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

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
