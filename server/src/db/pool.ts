import { Pool } from 'pg';

export function createPool(databaseUrl: string | undefined = process.env.DATABASE_URL): Pool {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан');
  }
  return new Pool({ connectionString: databaseUrl, max: 10 });
}
