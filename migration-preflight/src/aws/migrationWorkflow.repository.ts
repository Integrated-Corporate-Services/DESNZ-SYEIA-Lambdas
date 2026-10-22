import { MIGRATION_MESSAGES } from '../constants/migrationPreflight.constants';
import { StartExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';

export class ExecutionAlreadyExistsError extends Error {
  constructor() {
    super(MIGRATION_MESSAGES.EXECUTION_ALREADY_EXISTS);
    this.name = 'ExecutionAlreadyExistsError';
  }
}

export interface WorkflowStarter {
  start(name: string, input: object): Promise<string | null>;
}

export class AwsWorkflowStarter implements WorkflowStarter {
  constructor(
    private readonly arn: string,
    private readonly client = new SFNClient({})
  ) {}
  async start(name: string, input: object) {
    try {
      const response = await this.client.send(
        new StartExecutionCommand({ stateMachineArn: this.arn, name, input: JSON.stringify(input) })
      );
      return response.executionArn ?? null;
    } catch (error) {
      if ((error as { name?: string }).name === 'ExecutionAlreadyExists') {
        throw new ExecutionAlreadyExistsError();
      }
      throw error;
    }
  }
}
