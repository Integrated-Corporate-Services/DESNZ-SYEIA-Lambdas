/**
 * Tests for Environment Validation
 */

import { validateEnvVars, validateSQSMessage } from '../../src/util/validation.js';
import type { SQSRecord } from 'aws-lambda';

jest.mock('../../src/util/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Environment Validation', () => {
  const originalEnv = process.env;

  const dbEnvKeys = [
    'PGHOST',
    'DB_HOST',
    'HOST_NAME',
    'PGUSER',
    'DB_USER',
    'PGPASSWORD',
    'DB_PASSWORD',
    'PGDATABASE',
    'DB_NAME',
    'PGPORT',
    'DB_PORT',
    'DB_CREDENTIALS',
    'AWS_REGION',
    'REGION',
    'AWS_ENDPOINT_URL',
  ] as const;

  function clearDbEnvVars(): void {
    dbEnvKeys.forEach((key) => {
      delete process.env[key];
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    clearDbEnvVars();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateEnvVars', () => {
    test('should pass when all required env vars are present', () => {
      process.env.PGHOST = 'localhost';
      process.env.PGUSER = 'postgres';
      process.env.PGPASSWORD = 'password';
      process.env.PGDATABASE = 'testdb';
      process.env.PGPORT = '5432';
      process.env.AWS_REGION = 'eu-west-2';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
      process.env.WEBHOOK_SQS_QUEUE_URL = 'https://sqs.region.amazonaws.com/queue';
      process.env.ECS_CLUSTER_ARN = 'arn:aws:ecs:region:account:cluster/name';
      process.env.ECS_WEBHOOK_TASK_DEFINITION = 'task-def';
      process.env.GOVUK_PAY_WEBHOOK_SECRET = 'secret123';

      expect(() => validateEnvVars()).not.toThrow();
    });

    test('should pass with AWS Lambda environment variables', () => {
      clearDbEnvVars();
      delete process.env.AWS_ENDPOINT_URL;

      process.env.HOST_NAME = 'dev-eip-dev.example.rds.amazonaws.com';
      process.env.DB_CREDENTIALS = 'arn:aws:secretsmanager:eu-west-2:123456789012:secret:example';
      process.env.DB_NAME = 'icseip';
      process.env.DB_PORT = '5432';
      process.env.REGION = 'eu-west-2';
      process.env.GOVUK_PAY_WEBHOOK_SECRET = 'secret123';

      expect(() => validateEnvVars()).not.toThrow();
    });

    test('should throw error when database vars are missing', () => {
      clearDbEnvVars();

      let error: Error | undefined;
      try {
        validateEnvVars();
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain('Missing required environment variables');
      expect(error?.message).toContain('DB host (PGHOST|DB_HOST|HOST_NAME)');
      expect(error?.message).toContain('DB credentials (DB_CREDENTIALS|PGUSER+PGPASSWORD|DB_USER+DB_PASSWORD)');
    });

    test('should throw error when GOVUK_PAY_WEBHOOK_SECRET is missing in AWS mode', () => {
      clearDbEnvVars();
      delete process.env.AWS_ENDPOINT_URL;

      process.env.HOST_NAME = 'dev-eip-dev.example.rds.amazonaws.com';
      process.env.DB_CREDENTIALS = 'arn:aws:secretsmanager:eu-west-2:123456789012:secret:example';
      process.env.DB_NAME = 'icseip';
      process.env.DB_PORT = '5432';
      process.env.REGION = 'eu-west-2';
      delete process.env.GOVUK_PAY_WEBHOOK_SECRET;

      expect(() => validateEnvVars()).toThrow('GOVUK_PAY_WEBHOOK_SECRET (security)');
    });

    test('should throw error when GOVUK_PAY_WEBHOOK_SECRET is missing in LocalStack mode', () => {
      process.env.PGHOST = 'localhost';
      process.env.PGUSER = 'postgres';
      process.env.PGPASSWORD = 'password';
      process.env.PGDATABASE = 'testdb';
      process.env.PGPORT = '5432';
      process.env.AWS_REGION = 'eu-west-2';
      process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
      process.env.WEBHOOK_SQS_QUEUE_URL = 'https://sqs.region.amazonaws.com/queue';
      process.env.ECS_CLUSTER_ARN = 'arn:aws:ecs:region:account:cluster/name';
      process.env.ECS_WEBHOOK_TASK_DEFINITION = 'task-def';
      delete process.env.GOVUK_PAY_WEBHOOK_SECRET;

      expect(() => validateEnvVars()).toThrow('GOVUK_PAY_WEBHOOK_SECRET (security)');
    });
  });

  describe('validateSQSMessage', () => {
    test('should validate correct SQS message', () => {
      const message: Partial<SQSRecord> = {
        body: JSON.stringify({
          webhook: { type: 'payment.confirmed', data: { id: 'pay_123' } },
          metadata: { webhookId: 'evt_123', paymentId: 'pay_123' }
        })
      };

      const result = validateSQSMessage(message as SQSRecord);
      expect(result).toHaveProperty('webhook');
      expect(result).toHaveProperty('metadata');
    });

    test('should throw error for missing body', () => {
      const message = {} as SQSRecord;

      expect(() => validateSQSMessage(message)).toThrow('Invalid SQS message: missing body');
    });

    test('should throw error for invalid JSON', () => {
      const message: Partial<SQSRecord> = {
        body: 'invalid json {'
      };

      expect(() => validateSQSMessage(message as SQSRecord)).toThrow('body is not valid JSON');
    });

    test('should throw error for missing webhook', () => {
      const message: Partial<SQSRecord> = {
        body: JSON.stringify({
          metadata: { webhookId: 'evt_123', paymentId: 'pay_123' }
        })
      };

      expect(() => validateSQSMessage(message as SQSRecord)).toThrow('missing webhook');
    });

    test('should throw error for missing metadata', () => {
      const message: Partial<SQSRecord> = {
        body: JSON.stringify({
          webhook: { type: 'payment.confirmed', data: { id: 'pay_123' } }
        })
      };

      expect(() => validateSQSMessage(message as SQSRecord)).toThrow('missing metadata');
    });
  });
});
