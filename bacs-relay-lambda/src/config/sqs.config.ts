import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';

import { envConfig } from './env.config';
import { withRetry } from '../util/retry';
import { AppError } from '../errors/AppError';
import { createLogger } from '../util/logger';
import { ERROR_CODES, DLQ_SOURCE_RELAY } from '../constants/error.constants';
import { LOG_MESSAGES } from '../constants/log.constants';
import { RETRY_DEFAULTS } from '../constants/defaults.constants';

const log = createLogger('sqs.config.ts');

const METHOD = {
  SEND_TO_BACS_RELAY_QUEUE: 'sendToBacsRelayQueue',
  SEND_TO_BACS_RELAY_DLQ: 'sendToBacsRelayDeadLetterQueue',
  SEND_TO: 'sendTo',
  GET_CLIENT: 'getClient',
} as const;

export interface SqsSendInput {
  body: unknown;
  attributes?: Record<string, string>;
  deduplicationId?: string;
  groupId?: string;
}

class SqsConfig {
  private client: SQSClient | undefined;

  async sendToBacsRelayQueue(input: SqsSendInput): Promise<SendMessageCommandOutput> {
    log.start(METHOD.SEND_TO_BACS_RELAY_QUEUE);
    const env = envConfig.get();
    const out = await this.sendTo(env.PARTNER_WEBHOOKS_QUEUE_URL, input, 'partner-webhooks-queue');
    log.debug(METHOD.SEND_TO_BACS_RELAY_QUEUE, LOG_MESSAGES.SQS_MESSAGE_SENT_MAIN, { messageId: out.MessageId });
    log.end(METHOD.SEND_TO_BACS_RELAY_QUEUE);
    return out;
  }

  async sendToBacsRelayDeadLetterQueue(
    input: SqsSendInput,
    reason: string,
  ): Promise<SendMessageCommandOutput> {
    log.start(METHOD.SEND_TO_BACS_RELAY_DLQ);
    const env = envConfig.get();
    const out = await this.sendTo(
      env.PARTNER_WEBHOOKS_DLQ_URL,
      {
        ...input,
        attributes: {
          ...(input.attributes ?? {}),
          DLQReason: reason,
          DLQSource: DLQ_SOURCE_RELAY,
        },
      },
      'partner-webhooks-dlq',
    );
    log.warn(METHOD.SEND_TO_BACS_RELAY_DLQ, LOG_MESSAGES.SQS_MESSAGE_SENT_DLQ, {
      messageId: out.MessageId,
      reason,
    });
    log.end(METHOD.SEND_TO_BACS_RELAY_DLQ);
    return out;
  }

  private async sendTo(
    queueUrl: string,
    input: SqsSendInput,
    label: string,
  ): Promise<SendMessageCommandOutput> {
    log.start(METHOD.SEND_TO, { label });

    if (!queueUrl) {
      throw new AppError(ERROR_CODES.SQS_URL_MISSING, `${label} ${LOG_MESSAGES.SQS_QUEUE_URL_MISSING}`, {
        retryable: false,
      });
    }

    const body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);

    const messageAttributes = input.attributes
      ? Object.fromEntries(
          Object.entries(input.attributes).map(([k, v]) => [
            k,
            { DataType: 'String', StringValue: v },
          ]),
        )
      : undefined;

    const cmd = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: body,
      ...(messageAttributes ? { MessageAttributes: messageAttributes } : {}),
      ...(input.deduplicationId ? { MessageDeduplicationId: input.deduplicationId } : {}),
      ...(input.groupId ? { MessageGroupId: input.groupId } : {}),
    });

    const out = await withRetry(() => this.getClient().send(cmd), {
      attempts: RETRY_DEFAULTS.ATTEMPTS,
      baseDelayMs: RETRY_DEFAULTS.BASE_DELAY_MS,
      maxDelayMs: RETRY_DEFAULTS.MAX_DELAY_MS,
      label: `sqs:SendMessage:${label}`,
    });

    log.end(METHOD.SEND_TO, { label });
    return out;
  }

  private getClient(): SQSClient {
    log.start(METHOD.GET_CLIENT);
    if (!this.client) {
      const env = envConfig.get();
      this.client = new SQSClient({
        region: env.AWS_REGION,
        ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
      });
    }
    log.end(METHOD.GET_CLIENT);
    return this.client;
  }

  
  resetForTest(): void {
    this.client = undefined;
  }
}

export const sqsConfig = new SqsConfig();
