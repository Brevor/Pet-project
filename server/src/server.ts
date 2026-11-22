import { buildApp } from './app';
import { loadConfig } from './config';
import { createPool } from './db/pool';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = buildApp({
    pool,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
