import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError, errorBody } from '../../errors';
import { listMemberships } from '../access/repository';
import { hashPassword, verifyPassword } from './password';
import {
  MAX_AVATAR_BYTES,
  avatarMime,
  isAvatarContentType,
  readAvatar,
  removeAvatar,
  saveAvatar
} from './avatar';
import {
  findUserById,
  toPublicUser,
  updateAvatarKey,
  updatePassword,
  updateProfile
} from './repository';
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

const PHONE = /^[0-9+() -]{3,32}$/;
const SOCIAL = /^https?:\/\/\S{1,196}$/;

const profileBody = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .regex(PHONE, 'Телефон: цифры, +, пробелы, скобки и дефис (3–32)')
      .nullable()
      .optional(),
    socialUrl: z
      .string()
      .regex(SOCIAL, 'Ссылка должна начинаться с http:// или https://')
      .nullable()
      .optional(),
    messengerContact: z.string().max(100).nullable().optional(),
    about: z.string().max(500).nullable().optional()
  })
  .passthrough();

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200)
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    result[issue.path.join('.') || '_'] = issue.message;
  }
  return result;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  app.patch('/me', { preHandler: [app.authenticate] }, async (request: FastifyRequest, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const body = request.body as Record<string, unknown> | undefined;
    if (body && Object.prototype.hasOwnProperty.call(body, 'email')) {
      return reply
        .code(422)
        .send(
          errorBody('VALIDATION', 'Email — логин и не меняется', {
            fields: { email: 'Email используется для входа и не может быть изменён' }
          })
        );
    }

    const parsed = profileBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(422)
        .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
    }

    const updated = await updateProfile(pool, userId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: emptyToNull(parsed.data.phone),
      socialUrl: emptyToNull(parsed.data.socialUrl),
      messengerContact: emptyToNull(parsed.data.messengerContact),
      about: emptyToNull(parsed.data.about)
    });
    if (!updated) {
      throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
    }

    return { user: toPublicUser(updated) };
  });

  app.post(
    '/me/password',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const parsed = passwordBody.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(422)
          .send(errorBody('VALIDATION', 'Некорректные данные', { fields: fieldErrors(parsed.error) }));
      }

      const row = await findUserById(pool, userId);
      if (!row || !row.is_active) {
        throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
      }

      const matches = await verifyPassword(row.password_hash, parsed.data.currentPassword);
      if (!matches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный текущий пароль');
      }
      if (parsed.data.currentPassword === parsed.data.newPassword) {
        return reply.code(422).send(
          errorBody('VALIDATION', 'Новый пароль совпадает с текущим', {
            fields: { newPassword: 'Пароль должен отличаться от текущего' }
          })
        );
      }

      await updatePassword(pool, userId, await hashPassword(parsed.data.newPassword));
      return reply.code(204).send();
    }
  );

  app.post(
    '/me/avatar',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      const body = request.body;

      if (!isAvatarContentType(contentType) || !Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(422).send(
          errorBody('VALIDATION', 'Аватар не принят', {
            fields: {
              avatar: 'Нужен файл image/jpeg, image/png или image/webp (до 2 МБ)'
            }
          })
        );
      }
      if (body.length > MAX_AVATAR_BYTES) {
        return reply.code(422).send(
          errorBody('VALIDATION', 'Аватар не принят', {
            fields: { avatar: 'Размер файла больше 2 МБ' }
          })
        );
      }

      const current = await findUserById(pool, userId);
      if (!current || !current.is_active) {
        throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
      }

      const key = await saveAvatar(contentType!, body);
      if (current.avatar_key) {
        await removeAvatar(current.avatar_key);
      }
      const updated = await updateAvatarKey(pool, userId, key);
      if (!updated) {
        throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
      }

      return { user: toPublicUser(updated) };
    }
  );

  app.delete(
    '/me/avatar',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const current = await findUserById(pool, userId);
      if (current?.avatar_key) {
        await removeAvatar(current.avatar_key);
        await updateAvatarKey(pool, userId, null);
      }
      return reply.code(204).send();
    }
  );

  app.get('/avatars/:key', async (request: FastifyRequest, reply) => {
    const key = (request.params as { key: string }).key;
    const mime = avatarMime(key);
    const data = mime ? await readAvatar(key) : null;
    if (!mime || !data) {
      return reply.code(404).send(errorBody('NOT_FOUND', 'Аватар не найден'));
    }
    return reply
      .header('content-type', mime)
      .header('cache-control', 'public, max-age=86400')
      .send(data);
  });
}
