module.exports = {
  testMatch: ['**/tests/integration/**/*.test.ts'],
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};
