import { poolSslOption } from '../src/db/database';

describe('poolSslOption', () => {
  it('disables TLS for local compose against Postgres', () => {
    expect(poolSslOption('local')).toBe(false);
  });

  it('skips certificate verification in EIP-dev unless an operator opts in', () => {
    expect(poolSslOption('development')).toEqual({ rejectUnauthorized: false });
    expect(poolSslOption('development', 'true')).toEqual({ rejectUnauthorized: true });
  });

  it('verifies certificates in production unless an operator explicitly opts out', () => {
    expect(poolSslOption('production')).toEqual({ rejectUnauthorized: true });
    expect(poolSslOption(undefined)).toEqual({ rejectUnauthorized: true });
    expect(poolSslOption('production', 'false')).toEqual({ rejectUnauthorized: false });
  });
});
