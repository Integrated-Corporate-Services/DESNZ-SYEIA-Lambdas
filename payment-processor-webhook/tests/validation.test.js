/**
 * Tests for Environment Validation
 */

import { validateEnvVars, validateSQSMessage } from '../util/validation.js';

jest.mock('../util/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
  }
}));

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
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
      process.env.WEBHOOK_SQS_QUEUE_URL = 'https://sqs.region.amazonaws.com/queue';
      process.env.ECS_CLUSTER_ARN = 'arn:aws:ecs:region:account:cluster/name';
      process.env.ECS_WEBHOOK_TASK_DEFINITION = 'task-def';
      process.env.GOVUK_PAY_WEBHOOK_SECRET = 'secret123';

      expect(() => validateEnvVars()).not.toThrow();
    });

    test('should throw error when database vars are missing', () => {
      delete process.env.PGHOST;
      delete process.env.PGUSER;

      expect(() => validateEnvVars()).toThrow('Missing required environment variables');
      expect(() => validateEnvVars()).toThrow('PGHOST (database)');
      expect(() => validateEnvVars()).toThrow('PGUSER (database)');
    });

    test('should throw error when security vars are missing', () => {
      process.env.PGHOST = 'localhost';
      process.env.PGUSER = 'postgres';
      process.env.PGPASSWORD = 'password';
      process.env.PGDATABASE = 'testdb';
      process.env.WEBHOOK_SQS_QUEUE_URL = 'https://sqs.region.amazonaws.com/queue';
      process.env.ECS_CLUSTER_ARN = 'arn:aws:ecs:region:account:cluster/name';
      process.env.ECS_WEBHOOK_TASK_DEFINITION = 'task-def';
      delete process.env.GOVUK_PAY_WEBHOOK_SECRET;

      expect(() => validateEnvVars()).toThrow('GOVUK_PAY_WEBHOOK_SECRET (security)');
    });
  });

  describe('validateSQSMessage', () => {
    test('should validate correct SQS message', () => {
      const message = {
        body: JSON.stringify({
          webhook: { type: 'payment.confirmed', data: { id: 'pay_123' } },
          metadata: { webhookId: 'evt_123', paymentId: 'pay_123' }
        })
      };

      const result = validateSQSMessage(message);
      expect(result).toHaveProperty('webhook');
      expect(result).toHaveProperty('metadata');
    });

    test('should throw error for missing body', () => {
      const message = {};

      expect(() => validateSQSMessage(message)).toThrow('Invalid SQS message: missing body');
    });

    test('should throw error for invalid JSON', () => {
      const message = {
        body: 'invalid json {'
      };

      expect(() => validateSQSMessage(message)).toThrow('body is not valid JSON');
    });

    test('should throw error for missing webhook', () => {
      const message = {
        body: JSON.stringify({
          metadata: { webhookId: 'evt_123', paymentId: 'pay_123' }
        })
      };

      expect(() => validateSQSMessage(message)).toThrow('missing webhook');
    });

    test('should throw error for missing metadata', () => {
      const message = {
        body: JSON.stringify({
          webhook: { type: 'payment.confirmed', data: { id: 'pay_123' } }
        })
      };

      expect(() => validateSQSMessage(message)).toThrow('missing metadata');
    });
  });
});
