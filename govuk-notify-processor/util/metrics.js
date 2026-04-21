/**
 * CloudWatch Metrics Utility
 * 
 * Emit custom metrics to CloudWatch for monitoring and alerting
 * - NotifyEmailsQueued: Count of emails sent to SQS
 * - NotifyEmailsSent: Count of successful Notify API calls
 * - NotifyEmailsFailed: Count of permanent failures
 * - NotifyApiLatency: Duration of Notify API calls
 * - NotifyRetries: Count of retry attempts
 * - NotifyIdempotentRequests: Count of duplicate requests blocked
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import log from './logger.js';

const cloudwatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'eu-west-2',
});

const METRICS_CONFIG = {
  namespace: process.env.CLOUDWATCH_NAMESPACE || 'GovUKNotify',
  enabled: process.env.METRICS_ENABLED !== 'false', // Enabled by default
};

/**
 * Emit a metric to CloudWatch
 * @param {string} metricName - Name of the metric
 * @param {number} value - Metric value
 * @param {object} dimensions - Metric dimensions (optional)
 * @returns {Promise<void>}
 */
export async function emitMetric(metricName, value, dimensions = {}) {
  if (!METRICS_CONFIG.enabled) {
    log.debug('[metrics] Metrics disabled - skipping', { metricName, value });
    return;
  }

  try {
    // Build CloudWatch dimensions
    const metricDimensions = Object.entries(dimensions).map(([name, dimensionValue]) => ({
      Name: name,
      Value: String(dimensionValue),
    }));

    // Add environment dimension by default
    metricDimensions.push({
      Name: 'Environment',
      Value: process.env.ENVIRONMENT || 'production',
    });

    const command = new PutMetricDataCommand({
      Namespace: METRICS_CONFIG.namespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: metricName.includes('Latency') ? 'Milliseconds' : 'Count',
          Timestamp: new Date(),
          Dimensions: metricDimensions,
        },
      ],
    });

    await cloudwatchClient.send(command);

    log.debug('[metrics] Metric emitted', {
      metricName,
      value,
      dimensions,
      namespace: METRICS_CONFIG.namespace,
    });

  } catch (error) {
    // Non-critical error - log but don't fail the operation
    log.warn('[metrics] Failed to emit metric', {
      metricName,
      value,
      error: error.message,
    });
  }
}

/**
 * Emit multiple metrics in a single call (more efficient)
 * @param {Array<object>} metrics - Array of { name, value, dimensions }
 * @returns {Promise<void>}
 */
export async function emitMetrics(metrics) {
  if (!METRICS_CONFIG.enabled) {
    return;
  }

  try {
    const metricData = metrics.map(({ name, value, dimensions = {} }) => {
      const metricDimensions = Object.entries(dimensions).map(([dimName, dimValue]) => ({
        Name: dimName,
        Value: String(dimValue),
      }));

      metricDimensions.push({
        Name: 'Environment',
        Value: process.env.ENVIRONMENT || 'production',
      });

      return {
        MetricName: name,
        Value: value,
        Unit: name.includes('Latency') ? 'Milliseconds' : 'Count',
        Timestamp: new Date(),
        Dimensions: metricDimensions,
      };
    });

    const command = new PutMetricDataCommand({
      Namespace: METRICS_CONFIG.namespace,
      MetricData: metricData,
    });

    await cloudwatchClient.send(command);

    log.debug('[metrics] Batch metrics emitted', {
      count: metrics.length,
      namespace: METRICS_CONFIG.namespace,
    });

  } catch (error) {
    log.warn('[metrics] Failed to emit batch metrics', {
      error: error.message,
    });
  }
}
