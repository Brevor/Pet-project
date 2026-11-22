import { randomBytes } from 'node:crypto';
import { AppError } from '../../errors';

/** 8 символов base32-подобного алфавита: ~40 бит, перебор невыгоден (architecture §13). */
export function generateReferralCode(): string {
  return randomBytes(5).toString('hex').slice(0, 8);
}

const RESERVED = new Set([
  'join',
  'api',
  'admin',
  'login',
  'register',
  'health',
  'app',
  'www',
  'studio',
  'studios',
  'me',
  'auth'
]);

export function normalizeReferralCode(input: string): string {
  return input.trim().toLowerCase();
}

export function validateReferralCode(input: string): string {
  const code = normalizeReferralCode(input);

  if (code.length < 3 || code.length > 32 || !/^[a-z0-9-]+$/.test(code) || RESERVED.has(code)) {
    throw new AppError(
      422,
      'INVALID_REFERRAL',
      'Код: 3–32 символа, только a-z, 0-9 и дефис; зарезервированные слова запрещены'
    );
  }

  return code;
}
