import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import log from './logger.js';

const cwClient = new CloudWatchClient({ 
  region: process.env.AWS_REGION || 'eu-west-2' 
});

/**
 * Record metric to CloudWatch
 * @param {string} metricName - Name of the metric
 * @param {number} value - Metric value
 * @param {string} unit - CloudWatch unit (Count, Milliseconds, etc.)
 */
export async function recordMetric(metricName, value, unit = 'Count') {
  try {
    // Only send to CloudWatch in non-local environments
    if (process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'test') {
      log.debug('[metrics] Skipping CloudWatch in local/test mode', { metricName, value, unit });
      return;
    }

    await cwClient.send(new PutMetricDataCommand({
      Namespace: 'SYEIA/PaymentProcessor',
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
        }
      ],
    }));

    log.debug('[metrics] Metric recorded to CloudWatch', { metricName, value, unit });
  } catch (err) {
    // Don't fail processing if metrics fail
    log.error('[metrics] Failed to record metric', { 
      metricName, 
      error: err.message 
    });
  }
}
