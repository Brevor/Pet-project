import type { Pool } from 'pg';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_active: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

const USER_COLUMNS = 'id, email, password_hash, display_name, is_active';

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, displayName: row.display_name };
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
