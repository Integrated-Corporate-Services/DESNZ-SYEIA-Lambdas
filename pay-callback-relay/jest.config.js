export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/integration/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '*.ts',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/dead-code/**',
    '!jest.config.*.cjs',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { types: ['jest', 'node'] } }],
  },
};
