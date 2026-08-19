
interface Config {
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  sqsQueueUrl: string;
  environment: 'dev' | 'uat' | 'prod';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

let config: Config | null = null;

export const envConfig = {
  load: (): Config => {
    if (config) return config;

    const env = (process.env.NODE_ENV as Config['environment'] | undefined) ?? 'dev';
    const dbPortRaw = process.env.DB_PORT;
    const dbPort = dbPortRaw ? Number.parseInt(dbPortRaw, 10) : NaN;

    config = {
      dbHost: process.env.HOST_NAME ?? '',
      dbPort,
      dbUser: process.env.DB_USER ?? '',
      dbPassword: process.env.DB_PASSWORD ?? '',
      dbName: process.env.DB_NAME ?? '',
      sqsQueueUrl: process.env.SQS_QUEUE_URL ?? '',
      environment: env,
      logLevel: (process.env.LOG_LEVEL as Config['logLevel'] | undefined) ?? 'info',
    };

    validate(config);
    return config;
  },

  get: (): Config => {
    if (!config) {
      throw new Error('Config not loaded. Call envConfig.load() first.');
    }
    return config;
  },
};

function validate(cfg: Config): void {
  const required = ['dbHost', 'dbUser', 'dbPassword', 'dbName', 'sqsQueueUrl'];
  const missing = required.filter((key) => !cfg[key as keyof Config]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
