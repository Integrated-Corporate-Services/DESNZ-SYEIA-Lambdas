import { randomUUID } from 'crypto';
import { BatchRepository } from '../../src/migration-control/migrationBatch.repository';
import type { BatchAdmission } from '../../src/types/migrationBatch.types';
import { createManifest } from '../fixtures/migrationManifest.fixture';
import { createPostgresTestSetup } from '../helpers/postgresTestSetup';

describe('batch repository with real PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createPostgresTestSetup>> | undefined;
  let repository: BatchRepository;

  beforeAll(async () => {
    database = await createPostgresTestSetup();
    repository = new BatchRepository(database.pool, database.schema);
  });
  afterAll(async () => {
    await database?.close();
  });

  function admission(): BatchAdmission {
    const manifest = createManifest();
    return {
      migrationBatchId: randomUUID(),
      manifestKey: 'migrations/batch/manifest.json',
      manifestSha256: 'a'.repeat(64),
      ingestionMethod: 'DIRECT_S3',
      correlationId: randomUUID(),
      staleAfterSeconds: 3600,
      expectedCaseCount: 1,
      expectedDocumentCount: 1,
      sourceBucket: 'landing',
      casesFileKey: manifest.casesFile.key,
      documents: manifest.documents,
    };
  }

  async function stored(batchId: string) {
    if (!database) throw new Error('Integration database not initialised');
    const result = await database.pool.query(
      'SELECT * FROM ' + database.schema + '.migration_batch WHERE migration_batch_id=$1',
      [batchId]
    );
    return result.rows[0];
  }

  it('persists source paths and JSONB document inventory with bound values', async () => {
    const input = admission();
    input.documents[0].key = "migrations/batch/owner's plan.pdf";
    await repository.admit(input);
    expect(await stored(input.migrationBatchId)).toMatchObject({
      source_bucket: input.sourceBucket,
      manifest_key: input.manifestKey,
      cases_file_key: input.casesFileKey,
      document_files: input.documents,
      expected_document_count: 1,
      preflight_status: 'PREFLIGHT_IN_PROGRESS',
    });
  });

  it('persists an empty inventory as an empty JSON array', async () => {
    const input = admission();
    input.documents = [];
    input.expectedDocumentCount = 0;
    await repository.admit(input);
    expect((await stored(input.migrationBatchId)).document_files).toEqual([]);
  });

  it('grants exactly one concurrent owner and keeps the winning inventory', async () => {
    const first = admission();
    const second = { ...first, correlationId: randomUUID(), casesFileKey: 'different.csv' };
    const claims = await Promise.all([repository.admit(first), repository.admit(second)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = claims[0] ? first : second;
    expect(await stored(first.migrationBatchId)).toMatchObject({
      correlation_id: winner.correlationId,
      cases_file_key: winner.casesFileKey,
    });
  });

  it('requires ownership and validation before starting, then preserves started batches', async () => {
    const input = admission();
    await repository.admit(input);
    expect(await repository.markStarted(input.migrationBatchId, input.correlationId, 'arn')).toBe(
      false
    );
    expect(await repository.markValidated(input.migrationBatchId, randomUUID())).toBe(false);
    expect(await repository.markValidated(input.migrationBatchId, input.correlationId)).toBe(true);
    expect(await repository.markStarted(input.migrationBatchId, input.correlationId, 'arn')).toBe(
      true
    );
    await repository.recordFailure(
      input.migrationBatchId,
      input.correlationId,
      'BAD',
      'late failure',
      'bad.csv'
    );
    expect((await repository.get(input.migrationBatchId))?.preflight_status).toBe('WF1_STARTED');
    expect(await repository.admit({ ...input, correlationId: randomUUID() })).toBeNull();
  });

  it('records an owned failure and clears it on a claimed retry', async () => {
    const input = admission();
    await repository.admit(input);
    await repository.recordFailure(
      input.migrationBatchId,
      randomUUID(),
      'BAD',
      'wrong owner',
      'wrong.csv'
    );
    expect((await stored(input.migrationBatchId)).failure_code).toBeNull();
    await repository.recordFailure(
      input.migrationBatchId,
      input.correlationId,
      'BAD',
      'x'.repeat(2100),
      input.casesFileKey
    );
    expect((await stored(input.migrationBatchId)).failure_reason).toHaveLength(2000);
    const retry = { ...input, correlationId: randomUUID(), casesFileKey: 'retry.csv' };
    expect(await repository.admit(retry)).not.toBeNull();
    expect(await stored(input.migrationBatchId)).toMatchObject({
      cases_file_key: 'retry.csv',
      failure_code: null,
      failure_reason: null,
      failure_file_key: null,
    });
  });

  it('reclaims a stale in-progress owner', async () => {
    const input = admission();
    await repository.admit(input);
    if (!database) throw new Error('Integration database not initialised');
    await database.pool.query(
      'UPDATE ' +
        database.schema +
        ".migration_batch SET updated_at=NOW()-INTERVAL '2 hours' WHERE migration_batch_id=$1",
      [input.migrationBatchId]
    );
    expect(await repository.admit({ ...input, correlationId: randomUUID() })).not.toBeNull();
  });
});
