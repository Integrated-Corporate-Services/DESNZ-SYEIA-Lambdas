import log from './logger.js';
export async function recordMetric(metricName, value, _unit = 'Count') {
  try {
    log.debug('[metrics] Recorded', { metricName, value });
  } catch (err) {
    log.error('[metrics] Error', { err });
  }
}
