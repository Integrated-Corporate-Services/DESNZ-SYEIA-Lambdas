import { randomUUID } from 'crypto';
import { AppConfig } from '../config/config';
import { MigrationError } from '../errors/migration-error';
import { MigrationRequest } from '../types';

export function normaliseEvent(
  event: unknown,
  config: AppConfig,
  context: { awsRequestId: string }
): MigrationRequest {
  const value = event as {
    Records?: Array<{ s3?: { bucket?: { name?: string }; object?: { key?: string } } }>;
    id?: string;
    time?: string;
    source?: string;
    'detail-type'?: string;
    detail?: {
      bucket?: { name?: string };
      object?: { key?: string };
      'flow-name'?: string;
      'flow-execution-id'?: string;
      status?: string;
    };
  };
  if (value.source === 'aws.appflow' && value['detail-type'] === 'AppFlow End Flow Run Report') {
    return normaliseAppFlowEvent(value, config, context);
  }
  const record = value.Records?.[0];
  const bucket = record?.s3?.bucket?.name ?? value.detail?.bucket?.name;
  const rawObjectKey = record?.s3?.object?.key ?? value.detail?.object?.key;
  const isClassicS3 = Boolean(record?.s3);
  const isEventBridgeS3 =
    value.source === 'aws.s3' && value['detail-type'] === 'Object Created' && Boolean(rawObjectKey);
  const objectKey = rawObjectKey ? decodeURIComponent(rawObjectKey.replace(/\+/g, ' ')) : undefined;
  if (!objectKey || !bucket || (!isClassicS3 && !isEventBridgeS3)) {
    throw new MigrationError('UNSUPPORTED_EVENT', 'Event has no actionable S3 object');
  }
  const rootPrefix = `${config.migrationPrefixRoot.replace(/\/$/, '')}/`;
  if (
    bucket !== config.migrationBucket ||
    !objectKey.startsWith(rootPrefix) ||
    !objectKey.endsWith(`/${config.manifestFilename}`)
  ) {
    throw new MigrationError('UNSUPPORTED_EVENT', 'Event is not a migration manifest');
  }
  const prefix = objectKey.slice(0, -config.manifestFilename.length).replace(/\/$/, '');
  const migrationBatchId = prefix.split('/').filter(Boolean).at(-1) ?? null;
  return {
    migrationBatchId,
    ingestionMethod: 'DIRECT_S3',
    bucket,
    prefix,
    manifestKey: objectKey,
    appflowExecutionId: null,
    appflowFlowName: null,
    correlationId: context.awsRequestId || value.id || randomUUID(),
    eventTime: value.time ?? new Date().toISOString(),
  };
}

function normaliseAppFlowEvent(
  event: {
    id?: string;
    time?: string;
    detail?: { 'flow-name'?: string; 'flow-execution-id'?: string; status?: string };
  },
  config: AppConfig,
  context: { awsRequestId: string }
): MigrationRequest {
  const executionId = event.detail?.['flow-execution-id'];
  const flowName = event.detail?.['flow-name'];
  const status = event.detail?.status;
  if (!executionId || !flowName || (status && status !== 'Successful')) {
    throw new MigrationError(
      'UNSUPPORTED_EVENT',
      'AppFlow event is not a successful flow completion'
    );
  }
  const prefix = `${config.migrationPrefixRoot.replace(/\/$/, '')}/${executionId}`;
  return {
    migrationBatchId: executionId,
    ingestionMethod: 'APPFLOW',
    bucket: config.migrationBucket,
    prefix,
    manifestKey: `${prefix}/${config.manifestFilename}`,
    appflowExecutionId: executionId,
    appflowFlowName: flowName,
    correlationId: context.awsRequestId || event.id || randomUUID(),
    eventTime: event.time ?? new Date().toISOString(),
  };
}
