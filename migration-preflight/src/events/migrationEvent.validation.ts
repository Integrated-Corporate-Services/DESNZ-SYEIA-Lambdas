import {
  MIGRATION_ERROR_CODE,
  MIGRATION_MESSAGES,
  MIGRATION_STATE,
} from '../constants/migrationPreflight.constants';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/migrationPreflight.config';
import { MigrationError } from '../errors/migrationPreflight.error';
import { MigrationRequest } from '../types/migrationPreflight.types';

export function normaliseEvent(
  event: unknown,
  config: AppConfig,
  context: { awsRequestId: string }
): MigrationRequest {
  if (!event || typeof event !== 'object')
    throw new MigrationError(
      MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT,
      MIGRATION_MESSAGES.INVALID_EVENT
    );
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
  let objectKey = rawObjectKey;
  if (rawObjectKey && isClassicS3) {
    try {
      objectKey = decodeURIComponent(rawObjectKey.replace(/\+/g, ' '));
    } catch {
      throw new MigrationError(
        MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT,
        MIGRATION_MESSAGES.INVALID_ENCODED_KEY
      );
    }
  }
  if (!objectKey || !bucket || (!isClassicS3 && !isEventBridgeS3)) {
    throw new MigrationError(
      MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT,
      MIGRATION_MESSAGES.EVENT_OBJECT_MISSING
    );
  }
  const rootPrefix = `${config.migrationPrefixRoot.replace(/\/$/, '')}/`;
  if (
    bucket !== config.migrationBucket ||
    !objectKey.startsWith(rootPrefix) ||
    !objectKey.endsWith(`/${config.manifestFilename}`)
  ) {
    throw new MigrationError(
      MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT,
      MIGRATION_MESSAGES.NOT_MIGRATION_MANIFEST
    );
  }
  const prefix = objectKey.slice(0, -config.manifestFilename.length).replace(/\/$/, '');
  const migrationBatchId = prefix.split('/').filter(Boolean).at(-1) ?? null;
  return {
    migrationBatchId,
    ingestionMethod: MIGRATION_STATE.DIRECT_S3,
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
      MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT,
      MIGRATION_MESSAGES.APPFLOW_NOT_SUCCESSFUL
    );
  }
  const prefix = `${config.migrationPrefixRoot.replace(/\/$/, '')}/${executionId}`;
  return {
    migrationBatchId: executionId,
    ingestionMethod: MIGRATION_STATE.APPFLOW,
    bucket: config.migrationBucket,
    prefix,
    manifestKey: `${prefix}/${config.manifestFilename}`,
    appflowExecutionId: executionId,
    appflowFlowName: flowName,
    correlationId: context.awsRequestId || event.id || randomUUID(),
    eventTime: event.time ?? new Date().toISOString(),
  };
}
