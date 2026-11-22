import type { Pool } from 'pg';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  social_url: string | null;
  messenger_contact: string | null;
  avatar_key: string | null;
  about: string | null;
  is_active: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  socialUrl: string | null;
  messengerContact: string | null;
  about: string | null;
  avatarUrl: string | null;
}

export const USER_COLUMNS =
  'id, email, password_hash, display_name, first_name, last_name, phone, social_url, ' +
  'messenger_contact, avatar_key, about, is_active';

export function avatarUrlOf(key: string | null): string | null {
  return key ? `/api/v1/avatars/${key}` : null;
}

export function displayNameOf(row: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string;
}): string {
  const full = [row.first_name, row.last_name].filter((part) => part && part.length > 0).join(' ');
  return full.trim() || row.display_name || row.email;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: displayNameOf(row),
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    socialUrl: row.social_url,
    messengerContact: row.messenger_contact,
    about: row.about,
    avatarUrl: avatarUrlOf(row.avatar_key)
  };
}

export async function findUserByEmail(pool: Pool, email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserById(pool: Pool, id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
    id
  ]);
  return rows[0] ?? null;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export async function insertUser(pool: Pool, input: NewUser): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [input.email, input.passwordHash, input.displayName]
  );
  return rows[0]!;
}

export interface ProfilePatch {
  firstName: string;
  lastName: string;
  phone: string | null;
  socialUrl: string | null;
  messengerContact: string | null;
  about: string | null;
}

export async function updateProfile(
  pool: Pool,
  userId: string,
  patch: ProfilePatch
): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET
       first_name = $2,
       last_name = $3,
       phone = $4,
       social_url = $5,
       messenger_contact = $6,
       about = $7
     WHERE id = $1 AND is_active
     RETURNING ${USER_COLUMNS}`,
    [
      userId,
      patch.firstName,
      patch.lastName,
      patch.phone,
      patch.socialUrl,
      patch.messengerContact,
      patch.about
    ]
  );
  return rows[0] ?? null;
}

export async function updatePassword(pool: Pool, userId: string, hash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, hash]);
}

export async function updateAvatarKey(
  pool: Pool,
  userId: string,
  key: string | null
): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET avatar_key = $2 WHERE id = $1 AND is_active RETURNING ${USER_COLUMNS}`,
    [userId, key]
  );
  return rows[0] ?? null;
}
