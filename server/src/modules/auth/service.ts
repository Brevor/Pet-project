import type { Pool } from 'pg';
import { AppError } from '../../errors';
import { hashPassword, verifyPassword } from './password';
import { findUserByEmail, insertUser, toPublicUser, type PublicUser } from './repository';

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export async function registerUser(pool: Pool, input: RegisterInput): Promise<PublicUser> {
  const existing = await findUserByEmail(pool, input.email);
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Этот email уже зарегистрирован');
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const row = await insertUser(pool, {
      email: input.email,
      passwordHash,
      displayName: input.displayName ?? null
    });
    return toPublicUser(row);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Этот email уже зарегистрирован');
    }
    throw error;
  }
}

export async function authenticateUser(
  pool: Pool,
  email: string,
  password: string
): Promise<PublicUser> {
  const row = await findUserByEmail(pool, email);
  if (!row || !row.is_active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  const matches = await verifyPassword(row.password_hash, password);
  if (!matches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  return toPublicUser(row);
}
