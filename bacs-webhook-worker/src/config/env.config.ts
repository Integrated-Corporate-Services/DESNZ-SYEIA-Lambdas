
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

    const env = process.env.NODE_ENV;
    const dbPort = parseInt(process.env.DB_PORT, 10);

    config = {
      dbHost: process.env.DB_HOST,
      dbPort,
      dbUser: process.env.DB_USER,
      dbPassword: process.env.DB_PASSWORD,
      dbName: process.env.DB_NAME,
      sqsQueueUrl: process.env.SQS_QUEUE_URL,
      environment: (env as 'dev' | 'uat' | 'prod') || 'dev',
      logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
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
