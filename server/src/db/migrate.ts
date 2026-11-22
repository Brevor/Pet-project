import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

export async function migrate(databaseUrl: string, dir: string): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));
    const done: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        done.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${file} не применена: ${(error as Error).message}`);
      }
    }

    return done;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан');
  }

  const dir = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'migrations');
  const done = await migrate(databaseUrl, dir);

  if (done.length === 0) {
    console.log('Нечего применять: все миграции уже накачены');
    return;
  }
  console.log(`Применено миграций: ${done.length}`);
  for (const file of done) {
    console.log(`  + ${file}`);
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
