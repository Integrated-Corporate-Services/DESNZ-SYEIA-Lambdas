import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StartExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';
import { Readable } from 'stream';
import { MigrationError } from '../errors/migration-error';

export class ExecutionAlreadyExistsError extends Error {
  constructor() {
    super('Step Functions execution already exists');
    this.name = 'ExecutionAlreadyExistsError';
  }
}

export interface S3Store {
  getText(bucket: string, key: string, maxBytes: number): Promise<string>;
  head(bucket: string, key: string): Promise<{ size: number; checksum?: string }>;
}
export class AwsS3Store implements S3Store {
  constructor(private readonly client = new S3Client({})) {}
  async getText(bucket: string, key: string, maxBytes: number): Promise<string> {
    let output;
    try {
      output = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' })
      );
    } catch (error) {
      if (isNotFound(error)) throw new MigrationError('MANIFEST_NOT_FOUND', 'Manifest is missing');
      throw error;
    }
    const body = await (output.Body as Readable).toArray();
    const result = Buffer.concat(body);
    if (result.length > maxBytes) {
      throw new Error('Manifest exceeds configured maximum size');
    }
    return result.toString('utf8');
  }
  async head(bucket: string, key: string) {
    let output;
    try {
      output = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' })
      );
    } catch (error) {
      if (isNotFound(error))
        throw new MigrationError('MISSING_FILE', 'Declared package file is missing');
      throw error;
    }
    return { size: output.ContentLength ?? 0, checksum: output.ChecksumSHA256 };
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
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
