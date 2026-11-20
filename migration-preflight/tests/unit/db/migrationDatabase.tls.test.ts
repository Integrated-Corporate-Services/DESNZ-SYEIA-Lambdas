import { poolSslOption } from '../../../src/db/migrationDatabase.connection';

describe('database TLS selection (not a connection test)', () => {
  it.each([
    ['local', '', false],
    ['local', 'true', false],
    ['development', '', { rejectUnauthorized: false }],
    ['staging', '', { rejectUnauthorized: false }],
    ['production', '', { rejectUnauthorized: false }],
    ['test', '', { rejectUnauthorized: false }],
    ['staging', undefined, { rejectUnauthorized: false }],
    ['production', 'false', { rejectUnauthorized: false }],
    ['development', 'true', { rejectUnauthorized: true }],
    ['production', ' TRUE ', { rejectUnauthorized: true }],
  ])('selects TLS for environment %s and override %s', (environment, override, expected) => {
    expect(poolSslOption(environment as string, override as string)).toEqual(expected);
  });
});
