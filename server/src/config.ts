export interface Config {
  nodeEnv: string;
  host: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT должен быть целым числом от 1 до 65535, получено: ${env.PORT}`);
  }

  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    host: env.HOST ?? '127.0.0.1',
    port
  };
}
