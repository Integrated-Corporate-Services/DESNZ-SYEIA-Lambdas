export const paymentQueries = {
  RECORD_PAYMENT: `
    INSERT INTO payments (transaction_id, amount, status, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (transaction_id) DO UPDATE
    SET status = $3, updated_at = NOW()
  `,

  FIND_APPLICATION_BY_INVOICE_NUMBER: `
    SELECT application_id, invoice_number, payment_method, amount_pence
      FROM invoice
     WHERE invoice_number = $1
     LIMIT 1
  `,

  FIND_DESNZ_REF_BY_APPLICATION_ID: 'SELECT desnz_ref FROM application WHERE application_id = $1',

  GET_PAYMENT_STATUS: 'SELECT status FROM payments WHERE transaction_id = $1',

  MARK_WEBHOOK_PROCESSED: `
    UPDATE payment_webhooks
    SET
      status = 'PROCESSED',
      updated_at = NOW(),
      updated_by = $2
    WHERE webhook_id = $1
      AND status != 'PROCESSED'
  `,

  // Used only when MARK_WEBHOOK_PROCESSED updates zero rows, to tell apart
  // "already processed" (row exists, idempotent retry - fine) from
  // "webhook_id doesn't exist" (bad data - should fail loudly).
  FIND_WEBHOOK_BY_ID: 'SELECT webhook_id, status FROM payment_webhooks WHERE webhook_id = $1',
};
