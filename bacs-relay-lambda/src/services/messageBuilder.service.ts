import { PoisonMessageError } from '../errors/AppError';
import { createLogger } from '../util/logger';
import {
  BACS_RELAY_SCHEMA_VERSION,
  SOURCE_BACS,
} from '../constants/status.constants';
import type { PaymentWebhookRow, BacsRelayEnvelope } from '../types';

const log = createLogger('messageBuilder.service.ts');

const METHOD = {
  BUILD: 'build',
} as const;

class MessageBuilderService {
  build(row: PaymentWebhookRow): BacsRelayEnvelope {
    log.start(METHOD.BUILD, { webhookId: row.webhook_id });

    let payload: Record<string, unknown>;
    try {
      payload = typeof row.raw_payload === 'string'
        ? JSON.parse(row.raw_payload)
        : row.raw_payload;
    } catch (cause) {
      throw new PoisonMessageError('raw_payload is not valid JSON', {
        cause,
        meta: { webhookId: row.webhook_id },
      });
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new PoisonMessageError('raw_payload is not a JSON object', {
        meta: { webhookId: row.webhook_id },
      });
    }

    const receivedAtIso = row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();

    const envelope: BacsRelayEnvelope = {
      schemaVersion: BACS_RELAY_SCHEMA_VERSION,
      source: SOURCE_BACS,
      webhookId: row.webhook_id,
      paymentId: row.payment_id,
      eventType: row.event_type,
      status: row.status,
      correlationId: row.correlation_id,
      receivedAt: receivedAtIso,
      payload,
    };

    log.end(METHOD.BUILD, { webhookId: row.webhook_id });
    return envelope;
  }
}

export const messageBuilderService = new MessageBuilderService();
