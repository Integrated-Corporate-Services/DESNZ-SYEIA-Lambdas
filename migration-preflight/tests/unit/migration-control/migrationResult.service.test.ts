import { resolveExistingBatchResult } from '../../../src/migration-control/migrationResult.service';
import type { PreflightStatus } from '../../../src/types/migrationPreflight.types';

describe('existing batch outcome', () => {
  it.each<[PreflightStatus, string]>([
    ['WF1_STARTED', 'ALREADY_STARTED'],
    ['PREFLIGHT_FAILED', 'PREFLIGHT_FAILED'],
    ['PREFLIGHT_IN_PROGRESS', 'IN_PROGRESS_ELSEWHERE'],
    ['PREFLIGHT_VALIDATED', 'IN_PROGRESS_ELSEWHERE'],
  ])('maps %s to %s', (status, outcome) => {
    const result = resolveExistingBatchResult(
      {
        migration_batch_id: 'batch',
        preflight_status: status,
        step_function_execution_arn: 'arn:existing',
      },
      'batch',
      'correlation'
    );
    expect(result).toMatchObject({
      outcome,
      migrationBatchId: 'batch',
      correlationId: 'correlation',
    });
    expect(result.stepFunctionExecutionArn).toBe(status === 'WF1_STARTED' ? 'arn:existing' : null);
  });

  it('returns in-progress when no row is available', () => {
    expect(resolveExistingBatchResult(null, 'batch', 'correlation').outcome).toBe(
      'IN_PROGRESS_ELSEWHERE'
    );
  });
});
