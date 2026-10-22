module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
  clearMocks: true,
  restoreMocks: true,
};
