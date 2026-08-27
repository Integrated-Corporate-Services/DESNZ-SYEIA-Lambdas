/**
 * SQS delivery feature entry point.
 *
 * outboxService.js imports isSqsDeliveryEnabled/deliverToSqs from here. When
 * ENABLE_SQS_DELIVERY is false (the default) this module's delivery logic is
 * never invoked and all existing DIRECT/APPFLOW logic runs exactly as before.
 */
import { sqsDeliveryService } from './services/sqsDeliveryService.js';
import type { OutboxJob } from './types/index.js';

export { isSqsDeliveryEnabled } from './config/sqsConfig.js';

export async function deliverToSqs(job: OutboxJob): Promise<void> {
  return sqsDeliveryService.deliver(job);
}
