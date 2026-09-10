import { AwsS3Store } from '../src/aws/stores';
import { MigrationError } from '../src/errors/migration-error';

describe('AwsS3Store.getText', () => {
  it('returns a non-retryable MigrationError when the manifest is too large', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({
        Body: { toArray: async () => [Buffer.from('too-large')] },
      }),
    };
    await expect(new AwsS3Store(client as never).getText('bucket', 'key', 4)).rejects.toBeInstanceOf(
      MigrationError
    );
    await expect(new AwsS3Store(client as never).getText('bucket', 'key', 4)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
      retryable: false,
    });
  });
});
