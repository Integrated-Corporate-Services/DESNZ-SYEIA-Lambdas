import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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
let cachedCredentials: { username: string; password: string } | null = null;
let configLoadPromise: Promise<Config> | null = null;

async function resolveDbCredentials(): Promise<{ username: string; password: string }> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const raw = process.env.DB_CREDENTIALS?.trim();
  if (!raw) {
    // Fall back to individual env vars if DB_CREDENTIALS is not set
    const user = process.env.DB_USER ?? '';
    const password = process.env.DB_PASSWORD ?? '';
    if (!user || !password) {
      throw new Error('Missing DB_CREDENTIALS or DB_USER/DB_PASSWORD');
    }
    cachedCredentials = { username: user, password };
    return cachedCredentials;
  }

  // Check if DB_CREDENTIALS is a Secrets Manager ARN
  if (raw.startsWith('arn:aws:secretsmanager:')) {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || process.env.REGION || 'eu-west-2',
      ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
    });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: raw }),
    );
    const payload =
      response.SecretString ??
      (response.SecretBinary
        ? Buffer.from(response.SecretBinary as Uint8Array).toString('utf8')
        : undefined);
    if (!payload) {
      throw new Error('Secrets Manager secret has no SecretString or SecretBinary');
    }
    const parsed = JSON.parse(payload) as { username?: string; password?: string };
    if (!parsed.username || !parsed.password) {
      throw new Error("Secret JSON must contain 'username' and 'password'");
    }
    cachedCredentials = { username: parsed.username, password: parsed.password };
    return cachedCredentials;
  }

  // Otherwise, treat it as JSON credentials directly
  const parsed = JSON.parse(raw) as { username?: string; password?: string };
  if (!parsed.username || !parsed.password) {
    throw new Error("DB_CREDENTIALS JSON must contain 'username' and 'password'");
  }
  cachedCredentials = { username: parsed.username, password: parsed.password };
  return cachedCredentials;
}

export const envConfig = {
  load: async (): Promise<Config> => {
    if (config) return config;

    // Coalesce concurrent loads into a single promise
    if (configLoadPromise) {
      return configLoadPromise;
    }

    configLoadPromise = (async () => {
      try {
        const env = (process.env.NODE_ENV as Config['environment'] | undefined) ?? 'dev';
        const dbPortRaw = process.env.DB_PORT;
        const dbPort = dbPortRaw ? Number.parseInt(dbPortRaw, 10) : 5432;

        const credentials = await resolveDbCredentials();

        const loadedConfig: Config = {
          dbHost: process.env.HOST_NAME || process.env.DB_HOST || '',
          dbPort,
          dbUser: credentials.username,
          dbPassword: credentials.password,
          dbName: process.env.DB_NAME ?? '',
          sqsQueueUrl: process.env.SQS_QUEUE_URL ?? '',
          environment: env,
          logLevel: (process.env.LOG_LEVEL as Config['logLevel'] | undefined) ?? 'info',
        };

        validate(loadedConfig);
        config = loadedConfig;
        return loadedConfig;
      } finally {
        configLoadPromise = null;
      }
    })();

    return configLoadPromise;
  },

  get: (): Config => {
    if (!config) {
      throw new Error('Config not loaded. Call envConfig.load() first and await the result.');
    }
    return config;
  },
};

function validate(cfg: Config): void {
  const required = ['dbHost', 'dbUser', 'dbPassword', 'dbName'];
  const missing = required.filter((key) => !cfg[key as keyof Config]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
