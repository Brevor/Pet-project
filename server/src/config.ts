export interface Config {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT должен быть целым числом от 1 до 65535, получено: ${env.PORT}`);
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  const jwtSecret = env.JWT_SECRET ?? (nodeEnv === 'production' ? '' : 'dev-secret-change-me');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET обязателен в production');
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан');
  }

  return {
    nodeEnv,
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl,
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '24h'
  };
}
