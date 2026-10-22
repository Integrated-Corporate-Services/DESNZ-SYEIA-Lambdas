import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { AwsS3Store, s3ChecksumToHex } from '../../../src/aws/migrationS3.repository';

function createStorage() {
  const client = new S3Client({
    region: 'eu-west-2',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const send = jest.fn();
  client.send = send;
  // Every tested call gets an explicit mocked response. No SDK request is sent.
  send.mockRejectedValue(new Error('Unconfigured S3 response'));
  return { storage: new AwsS3Store(client), send, client };
}

describe('S3 adapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads UTF-8 text and supplies the requested object key', async () => {
    const { storage, send, client } = createStorage();
    send.mockResolvedValue({ Body: Readable.from([Buffer.from('hello')]) });
    try {
      await expect(storage.getText('bucket', 'manifest.json', 5)).resolves.toBe('hello');
      expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
      expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'bucket', Key: 'manifest.json' });
    } finally {
      client.destroy();
    }
  });

  it('rejects streams exceeding the byte limit', async () => {
    const { storage, send, client } = createStorage();
    send.mockResolvedValue({ Body: Readable.from([Buffer.from('too-large')]) });
    try {
      await expect(storage.getText('bucket', 'key', 4)).rejects.toMatchObject({
        code: 'INVALID_MANIFEST',
        retryable: false,
      });
    } finally {
      client.destroy();
    }
  });

  it('normalises HEAD checksum metadata', async () => {
    const { storage, send, client } = createStorage();
    const hex = 'a'.repeat(64);
    send.mockResolvedValue({
      ContentLength: 20,
      ChecksumSHA256: Buffer.from(hex, 'hex').toString('base64'),
    });
    try {
      await expect(storage.head('bucket', 'key')).resolves.toEqual({ size: 20, checksum: hex });
      expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    } finally {
      client.destroy();
    }
  });

  it('distinguishes missing manifest retries from missing package files', async () => {
    const { storage, send, client } = createStorage();
    send.mockRejectedValue({ name: 'NoSuchKey' });
    try {
      await expect(storage.getText('bucket', 'key', 100)).rejects.toMatchObject({
        code: 'MANIFEST_NOT_FOUND',
        retryable: true,
      });
      await expect(storage.head('bucket', 'key')).rejects.toMatchObject({
        code: 'MISSING_FILE',
        retryable: false,
      });
    } finally {
      client.destroy();
    }
  });
});

describe('checksum normalisation', () => {
  it('accepts hexadecimal and decodes S3 Base64 SHA-256', () => {
    const hex = 'a'.repeat(64);
    expect(s3ChecksumToHex(hex.toUpperCase())).toBe(hex);
    expect(s3ChecksumToHex(Buffer.from(hex, 'hex').toString('base64'))).toBe(hex);
    expect(s3ChecksumToHex()).toBeUndefined();
  });
});
