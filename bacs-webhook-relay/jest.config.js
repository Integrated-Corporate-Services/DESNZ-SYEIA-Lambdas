/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.unit.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'handler.ts',
    'index.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
};
