import { AwsS3Store } from '../src/aws/stores';
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
