import {
  validatePackageKeys,
  validatePackageFile,
} from '../../../src/manifest/migrationPackage.validation';
import type { S3Store } from '../../../src/aws/migrationS3.adapter';
import { createManifest } from '../../fixtures/migrationManifest.fixture';

describe('package keys', () => {
  it('allows unique paths under the batch prefix', () => {
    expect(() => validatePackageKeys(createManifest(), 'migrations/TEST-BATCH-001')).not.toThrow();
  });

  it('rejects duplicate keys', () => {
    const manifest = createManifest();
    manifest.documents[0].key = manifest.casesFile.key;
    expect(() => validatePackageKeys(manifest, 'migrations/TEST-BATCH-001')).toThrow('duplicate');
  });

  it.each([
    'migrations/OTHER/plan.pdf',
    'migrations/TEST-BATCH-001/../plan.pdf',
    'migrations/TEST-BATCH-001//plan.pdf',
    '/migrations/TEST-BATCH-001/plan.pdf',
  ])('rejects unsafe key %s', (key) => {
    const manifest = createManifest();
    manifest.documents[0].key = key;
    expect(() => validatePackageKeys(manifest, 'migrations/TEST-BATCH-001')).toThrow('unsafe');
  });
});

describe('package metadata', () => {
  const file = { key: 'plan.pdf', sizeBytes: 10, checksum: 'a'.repeat(64) };
  function storage(): jest.Mocked<S3Store> {
    return { getText: jest.fn(), head: jest.fn() };
  }

  it('accepts size and case-insensitive matching checksum', async () => {
    const s3 = storage();
    s3.head.mockResolvedValue({ size: 10, checksum: 'A'.repeat(64) });
    await expect(validatePackageFile(s3, 'bucket', file)).resolves.toBeUndefined();
    expect(s3.head).toHaveBeenCalledWith('bucket', 'plan.pdf');
  });

  it('rejects a size mismatch', async () => {
    const s3 = storage();
    s3.head.mockResolvedValue({ size: 11, checksum: file.checksum });
    await expect(validatePackageFile(s3, 'bucket', file)).rejects.toMatchObject({
      code: 'MISSING_FILE',
    });
  });

  it.each([undefined, 'b'.repeat(64)])(
    'rejects absent or wrong required checksum %s',
    async (checksum) => {
      const s3 = storage();
      s3.head.mockResolvedValue({ size: 10, checksum });
      await expect(validatePackageFile(s3, 'bucket', file)).rejects.toMatchObject({
        code: 'CHECKSUM_MISMATCH',
      });
    }
  );

  it('allows size-only validation when no checksum is declared', async () => {
    const s3 = storage();
    s3.head.mockResolvedValue({ size: 10 });
    await expect(
      validatePackageFile(s3, 'bucket', { key: 'plan.pdf', sizeBytes: 10 })
    ).resolves.toBeUndefined();
  });
});
