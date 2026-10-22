import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  AwsWorkflowStarter,
  ExecutionAlreadyExistsError,
} from '../../../src/aws/migrationWorkflow.repository';

describe('Step Functions adapter', () => {
  const client = new SFNClient({
    region: 'eu-west-2',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => client.destroy());

  it('serialises input and returns the execution ARN', async () => {
    const send = jest.fn().mockResolvedValue({ executionArn: 'arn:execution' });
    client.send = send;
    const workflow = new AwsWorkflowStarter('arn:machine', client);
    await expect(workflow.start('batch-hash', { migrationBatchId: 'batch' })).resolves.toBe(
      'arn:execution'
    );
    expect(send).toHaveBeenCalledWith(expect.any(StartExecutionCommand));
    expect(send.mock.calls[0][0].input).toEqual({
      stateMachineArn: 'arn:machine',
      name: 'batch-hash',
      input: '{"migrationBatchId":"batch"}',
    });
  });

  it('maps duplicate execution errors and preserves other failures', async () => {
    const send = jest.fn().mockRejectedValue({ name: 'ExecutionAlreadyExists' });
    client.send = send;
    const workflow = new AwsWorkflowStarter('arn:machine', client);
    await expect(workflow.start('name', {})).rejects.toBeInstanceOf(ExecutionAlreadyExistsError);
    const error = new Error('AWS unavailable');
    send.mockRejectedValue(error);
    await expect(workflow.start('name', {})).rejects.toBe(error);
  });
});
