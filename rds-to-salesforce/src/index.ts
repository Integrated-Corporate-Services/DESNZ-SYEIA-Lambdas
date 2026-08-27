import { sqsDeliveryService } from './services/sqsDeliveryService.js';
import type { OutboxJob } from './types/index.js';

export { isSqsDeliveryEnabled } from './config/sqsConfig.js';

export async function deliverToSqs(job: OutboxJob): Promise<void> {
  return sqsDeliveryService.deliver(job);
}
