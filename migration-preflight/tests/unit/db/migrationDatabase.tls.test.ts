import { poolSslOption } from '../../../src/db/migrationDatabase.repository';

describe('database TLS selection (not a connection test)', () => {
  it.each([
    ['local', '', false],
    ['local', 'true', false],
    ['development', '', { rejectUnauthorized: false }],
    ['development', 'true', { rejectUnauthorized: true }],
    ['production', '', { rejectUnauthorized: true }],
    ['test', '', { rejectUnauthorized: true }],
    ['production', 'false', { rejectUnauthorized: false }],
  ])('selects TLS for environment %s and override %s', (environment, override, expected) => {
    expect(poolSslOption(environment as string, override as string)).toEqual(expected);
  });
});
