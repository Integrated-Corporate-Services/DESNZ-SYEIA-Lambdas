import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import log from './logger.js';

const cwClient = new CloudWatchClient({ 
  region: process.env.AWS_REGION || 'eu-west-2' 
});

/**
 * Record metric to CloudWatch
 * @param metricName - Name of the metric
 * @param value - Metric value
 * @param unit - CloudWatch unit (Count, Milliseconds, etc.)
 */
export async function recordMetric(
  metricName: string, 
  value: number, 
  unit: StandardUnit | string = 'Count'
): Promise<void> {
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
          Unit: unit as StandardUnit,
          Timestamp: new Date(),
        }
      ],
    }));

    log.debug('[metrics] Metric recorded to CloudWatch', { metricName, value, unit });
  } catch (err) {
    const error = err as Error;
    // Don't fail processing if metrics fail
    log.error('[metrics] Failed to record metric', { 
      metricName, 
      error: error.message 
    });
  }
}
