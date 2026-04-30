/**
 * Email Request Repository
 * 
 * Manages email requests in PostgreSQL database
 * - Record new requests
 * - Update status (pending, sent, failed)
 * - Track notification IDs from GOV.UK Notify
 */

import { query } from '../util/database.js';
import log from '../util/logger.js';

/**
 * Record new email request in database
 */
export async function recordEmailRequest(data) {
  try {
    log.debug('[emailRequestRepository] Recording email request', {
      requestId: data.requestId,
      reference: data.reference,
      status: data.status,
    });

    await query(
      `INSERT INTO notify_email_requests (
        request_id,
        correlation_id,
        reference,
        email_address,
        template_id,
        personalisation,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (request_id) DO NOTHING`,
      [
        data.requestId,
        data.correlationId,
        data.reference,
        data.emailAddress,
        data.templateId,
        JSON.stringify(data.personalisation || {}),
        data.status,
      ]
    );

    log.info('[emailRequestRepository] Email request recorded', {
      requestId: data.requestId,
      reference: data.reference,
    });

  } catch (error) {
    log.error('[emailRequestRepository] Error recording email request', {
      requestId: data.requestId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update email request status
 */
export async function updateEmailRequestStatus(
  requestId,
  status,
  notificationId,
  errorMessage
) {
  try {
    log.debug('[emailRequestRepository] Updating email request status', {
      requestId,
      status,
      notificationId,
    });

    const sentAt = status === 'sent' ? 'NOW()' : 'NULL';
    const failedAt = status === 'failed' ? 'NOW()' : 'NULL';

    await query(
      `UPDATE notify_email_requests
       SET status = $1,
           notification_id = $2,
           error_message = $3,
           sent_at = ${sentAt},
           failed_at = ${failedAt},
           updated_at = NOW()
       WHERE request_id = $4`,
      [status, notificationId, errorMessage, requestId]
    );

    log.info('[emailRequestRepository] Email request status updated', {
      requestId,
      status,
      notificationId,
    });

  } catch (error) {
    log.error('[emailRequestRepository] Error updating email request', {
      requestId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Increment retry count
 */
export async function incrementRetryCount(requestId) {
  try {
    await query(
      `UPDATE notify_email_requests
       SET retry_count = retry_count + 1,
           updated_at = NOW()
       WHERE request_id = $1`,
      [requestId]
    );

    log.debug('[emailRequestRepository] Retry count incremented', { requestId });

  } catch (error) {
    log.error('[emailRequestRepository] Error incrementing retry', {
      requestId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Find email request by reference
 */
export async function findByReference(reference) {
  try {
    const result = await query(
      `SELECT * FROM notify_email_requests WHERE reference = $1`,
      [reference]
    );

    return result.rows[0] || null;

  } catch (error) {
    log.error('[emailRequestRepository] Error finding by reference', {
      reference,
      error: error.message,
    });
    throw error;
  }
}
