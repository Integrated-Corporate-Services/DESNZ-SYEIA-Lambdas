import { createPreflightTestSetup } from '../../helpers/preflightTestSetup';
import { ExecutionAlreadyExistsError } from '../../../src/aws/migrationWorkflow.repository';

describe('preflight admission and workflow ownership', () => {
  it('stores named admission values and starts a deterministic execution', async () => {
    const h = createPreflightTestSetup();
    await expect(h.service.runPreflight(h.request)).resolves.toMatchObject({
      outcome: 'WF1_STARTED',
      stepFunctionExecutionArn: 'arn:execution',
    });
    expect(h.batches.admit).toHaveBeenCalledWith({
      migrationBatchId: h.manifest.migrationBatchId,
      manifestKey: h.request.manifestKey,
      manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      ingestionMethod: 'DIRECT_S3',
      correlationId: h.request.correlationId,
      staleAfterSeconds: 3600,
      expectedCaseCount: 1,
      expectedDocumentCount: 1,
      sourceBucket: h.request.bucket,
      casesFileKey: h.manifest.casesFile.key,
      documents: h.manifest.documents,
    });
    expect(h.workflow.start).toHaveBeenCalledWith(
      expect.stringMatching(/^TEST-BATCH-001-[a-f0-9]{16}$/),
      { migrationBatchId: h.request.migrationBatchId, correlationId: h.request.correlationId }
    );
  });

  it('returns an already-started batch without overwriting or validating its inventory', async () => {
    const h = createPreflightTestSetup();
    h.batches.admit.mockResolvedValue(null);
    h.batches.get.mockResolvedValue({
      migration_batch_id: h.manifest.migrationBatchId,
      preflight_status: 'WF1_STARTED',
      step_function_execution_arn: 'arn:existing',
    });
    await expect(h.service.runPreflight(h.request)).resolves.toMatchObject({
      outcome: 'ALREADY_STARTED',
      stepFunctionExecutionArn: 'arn:existing',
    });
    expect(h.s3.head).not.toHaveBeenCalled();
    expect(h.workflow.start).not.toHaveBeenCalled();
    expect(h.batches.recordFailure).not.toHaveBeenCalled();
  });

  it('does not start a workflow when validation ownership has changed', async () => {
    const h = createPreflightTestSetup();
    h.batches.markValidated.mockResolvedValue(false);
    await expect(h.service.runPreflight(h.request)).resolves.toMatchObject({
      outcome: 'IN_PROGRESS_ELSEWHERE',
    });
    expect(h.workflow.start).not.toHaveBeenCalled();
  });

  it('maps an existing execution to ALREADY_STARTED after a successful ownership update', async () => {
    const h = createPreflightTestSetup();
    h.workflow.start.mockRejectedValue(new ExecutionAlreadyExistsError());
    await expect(h.service.runPreflight(h.request)).resolves.toMatchObject({
      outcome: 'ALREADY_STARTED',
    });
    expect(h.batches.markStarted).toHaveBeenCalledWith(
      h.request.migrationBatchId,
      h.request.correlationId,
      null
    );
  });

  it.each([false, true])(
    'rechecks ownership after workflow start (already exists=%s)',
    async (alreadyExists) => {
      const h = createPreflightTestSetup();
      if (alreadyExists) h.workflow.start.mockRejectedValue(new ExecutionAlreadyExistsError());
      h.batches.markStarted.mockResolvedValue(false);
      await expect(h.service.runPreflight(h.request)).resolves.toMatchObject({
        outcome: 'IN_PROGRESS_ELSEWHERE',
      });
      expect(h.batches.get).toHaveBeenCalledWith(h.request.migrationBatchId);
    }
  );
});
