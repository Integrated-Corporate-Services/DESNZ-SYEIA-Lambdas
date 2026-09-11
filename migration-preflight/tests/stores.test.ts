import { AwsS3Store, s3ChecksumToHex } from '../src/aws/stores';
import { MigrationError } from '../src/errors/migration-error';

describe('AwsS3Store.getText', () => {
  it('returns a non-retryable MigrationError when the manifest is too large', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({
        Body: { toArray: async () => [Buffer.from('too-large')] },
      }),
    };
    const result = new AwsS3Store(client as never).getText('bucket', 'key', 4);
    await expect(result).rejects.toBeInstanceOf(MigrationError);
    await expect(result).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
      retryable: false,
    });
  });
});

describe('s3ChecksumToHex', () => {
  it('keeps a 64-character hex digest', () => {
    const hex = 'a'.repeat(64);
    expect(s3ChecksumToHex(hex)).toBe(hex);
  });

  it('converts S3 Base64 ChecksumSHA256 into hex', () => {
    const hex = '48e73b8487562afb8ef8b3fe5d949cb2d7951a623273ea66fb47811f5dc4499a';
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    expect(s3ChecksumToHex(base64)).toBe(hex);
  });
});

describe('AwsS3Store.head', () => {
  it('returns the S3 SHA-256 checksum as hex for comparison with the manifest', async () => {
    const hex = '4f5d87bf7944b39e5914ac08bcd834f8628000ac46526420a4bdfe25911ab2af';
    const client = {
      send: jest.fn().mockResolvedValue({
        ContentLength: 2532,
        ChecksumSHA256: Buffer.from(hex, 'hex').toString('base64'),
      }),
    };
    await expect(new AwsS3Store(client as never).head('bucket', 'key')).resolves.toEqual({
      size: 2532,
      checksum: hex,
    });
  });
});
