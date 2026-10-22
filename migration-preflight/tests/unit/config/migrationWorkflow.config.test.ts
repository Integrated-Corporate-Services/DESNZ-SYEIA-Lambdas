import { loadWorkflowConfig } from '../../../src/config/migrationPreflight.config';
import { createWorkflowConfig } from '../../fixtures/migrationConfig.fixture';

describe('workflow configuration', () => {
  it('allows an absent optional configuration', () => {
    expect(loadWorkflowConfig()).toBeUndefined();
  });

  it.each(['{broken', 'null', '[]', '"text"'])('rejects invalid input %s', (raw) => {
    expect(() => loadWorkflowConfig(raw)).toThrow('Invalid MIGRATION_WORKFLOW_CONFIG_JSON');
  });

  it.each([
    'ecsClusterArn',
    'runtimeTaskDefinitionArn',
    'runtimeContainerName',
    'approvalHandlerArn',
    'networkConfiguration',
  ])('requires %s when configuration is supplied', (field) => {
    const input: Record<string, unknown> = createWorkflowConfig();
    delete input[field];
    expect(() => loadWorkflowConfig(JSON.stringify(input))).toThrow('requires ECS');
  });

  it('returns allowed deployment fields without forwarding unrelated properties', () => {
    const config = createWorkflowConfig();
    expect(loadWorkflowConfig(JSON.stringify({ ...config, unrelated: 'do not forward' }))).toEqual(
      config
    );
  });
});
