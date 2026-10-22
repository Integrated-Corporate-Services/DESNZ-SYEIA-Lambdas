import {
  MIGRATION_ERROR_CODE,
  MIGRATION_MESSAGES,
} from '../constants/migrationPreflight.constants';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { Readable } from 'stream';

import { MigrationError } from '../errors/migrationPreflight.error';

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
      if (isNotFound(error))
        throw new MigrationError(
          MIGRATION_ERROR_CODE.MANIFEST_NOT_FOUND,
          MIGRATION_MESSAGES.MANIFEST_NOT_FOUND,
          true
        );
      throw error;
    }
    const body: Buffer[] = [];
    let size = 0;
    const stream = output.Body as Readable;
    for await (const part of stream) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      if (size > maxBytes) {
        stream.destroy();
        throw new MigrationError(
          MIGRATION_ERROR_CODE.INVALID_MANIFEST,
          MIGRATION_MESSAGES.MANIFEST_TOO_LARGE
        );
      }
      body.push(chunk);
    }
    const result = Buffer.concat(body);
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
        throw new MigrationError(
          MIGRATION_ERROR_CODE.MISSING_FILE,
          MIGRATION_MESSAGES.PACKAGE_FILE_NOT_FOUND
        );
      throw error;
    }
    return { size: output.ContentLength ?? 0, checksum: s3ChecksumToHex(output.ChecksumSHA256) };
  }
}

export function s3ChecksumToHex(checksum?: string): string | undefined {
  if (!checksum) return undefined;
  const trimmed = checksum.trim();
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  try {
    const bytes = Buffer.from(trimmed, 'base64');
    if (bytes.length === 32) return bytes.toString('hex');
  } catch {
    return trimmed;
  }
  return trimmed;
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
