import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { AppError } from '../src/errors';

test('GET /health отвечает 200 и status ok', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });

  await app.close();
});

test('неизвестный маршрут отдаёт NOT_FOUND', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'GET', url: '/nope' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'NOT_FOUND');

  await app.close();
});

test('AppError превращается в свой статус, код и details', async () => {
  const app = buildApp();
  app.get('/boom', async () => {
    throw new AppError(409, 'ROOM_IN_USE', 'Зал занят', { sessionCount: 2 });
  });

  const response = await app.inject({ method: 'GET', url: '/boom' });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: { code: 'ROOM_IN_USE', message: 'Зал занят', details: { sessionCount: 2 } }
  });

  await app.close();
});
