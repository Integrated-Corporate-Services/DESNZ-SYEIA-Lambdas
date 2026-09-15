export const paymentQueries = {
  RECORD_PAYMENT: `
    INSERT INTO payments (transaction_id, amount, status, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (transaction_id) DO UPDATE
    SET status = $3, updated_at = NOW()
  `,

  FIND_APPLICATION_BY_INVOICE_NUMBER: `
    SELECT application_id, invoice_number, payment_method
      FROM invoice
     WHERE invoice_number = $1
     LIMIT 1
  `,

  FIND_DESNZ_REF_BY_APPLICATION_ID: 'SELECT desnz_ref FROM application WHERE application_id = $1',

  GET_PAYMENT_STATUS: 'SELECT status FROM payments WHERE transaction_id = $1',

  MARK_WEBHOOK_PROCESSED: `
    UPDATE payment_webhooks
    SET 
      status = 'processed',
      updated_at = NOW(),
      updated_by = $2
    WHERE webhook_id = $1
      AND status != 'processed'
  `,
};
