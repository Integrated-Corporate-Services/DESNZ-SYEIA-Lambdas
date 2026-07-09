/** @type {import('jest').Config} */
const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/*.integration.test.ts'],
  displayName: 'integration',
  testTimeout: 30000, // Integration tests may take longer
};
