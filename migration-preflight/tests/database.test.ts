import { poolSslOption } from '../src/db/database';

describe('poolSslOption', () => {
  it('disables TLS for local compose against Postgres', () => {
    expect(poolSslOption('local')).toBe(false);
  });

  it('uses encrypted RDS connections without verifying the corporate/RDS chain', () => {
    expect(poolSslOption('development')).toEqual({ rejectUnauthorized: false });
    expect(poolSslOption('production')).toEqual({ rejectUnauthorized: false });
    expect(poolSslOption(undefined)).toEqual({ rejectUnauthorized: false });
  });
});
