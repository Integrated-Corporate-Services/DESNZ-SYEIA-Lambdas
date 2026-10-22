import { createPreflightTestSetup } from '../../helpers/preflightTestSetup';

describe('preflight failures and diagnostic ownership', () => {
  it('records the full offending file key and never starts a workflow on checksum failure', async () => {
    const h = createPreflightTestSetup();
    h.s3.head.mockResolvedValue({ size: 20, checksum: 'c'.repeat(64) });
    await expect(h.service.runPreflight(h.request)).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    });
    expect(h.batches.recordFailure).toHaveBeenCalledWith(
      h.request.migrationBatchId,
      h.request.correlationId,
      'CHECKSUM_MISMATCH',
      expect.any(String),
      h.manifest.casesFile.key
    );
    expect(h.workflow.start).not.toHaveBeenCalled();
  });

  it('does not create or update a batch for malformed manifest JSON', async () => {
    const h = createPreflightTestSetup();
    h.s3.getText.mockResolvedValue('{broken');
    await expect(h.service.runPreflight(h.request)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
    });
    expect(h.batches.admit).not.toHaveBeenCalled();
    expect(h.batches.recordFailure).not.toHaveBeenCalled();
  });

  it('rejects a manifest that belongs to another batch before admission', async () => {
    const h = createPreflightTestSetup();
    h.s3.getText.mockResolvedValue(JSON.stringify({ ...h.manifest, migrationBatchId: 'OTHER' }));
    await expect(h.service.runPreflight(h.request)).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
    });
    expect(h.batches.admit).not.toHaveBeenCalled();
  });

  it('propagates a pre-admission infrastructure error without writing failure metadata', async () => {
    const h = createPreflightTestSetup();
    const error = new Error('S3 unavailable');
    h.s3.getText.mockRejectedValue(error);
    await expect(h.service.runPreflight(h.request)).rejects.toBe(error);
    expect(h.batches.recordFailure).not.toHaveBeenCalled();
  });

  it('preserves the original failure even when recording the failure also fails', async () => {
    const h = createPreflightTestSetup();
    const error = new Error('S3 unavailable');
    h.s3.head.mockRejectedValue(error);
    h.batches.recordFailure.mockRejectedValue(new Error('DB unavailable'));
    await expect(h.service.runPreflight(h.request)).rejects.toBe(error);
    expect(h.batches.recordFailure).toHaveBeenCalledWith(
      h.request.migrationBatchId,
      h.request.correlationId,
      'UNKNOWN',
      'S3 unavailable',
      h.manifest.casesFile.key
    );
  });
});
