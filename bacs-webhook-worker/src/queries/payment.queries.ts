export const paymentQueries = {
  FIND_APPLICATION_BY_INVOICE_NUMBER: `
    SELECT application_id, invoice_number, payment_method, payment_record_id
      FROM invoice
     WHERE invoice_number = $1
     LIMIT 1
  `,

  FIND_PAYMENT_FOR_INVOICE: `
    SELECT id, application_id, status
      FROM payment
     WHERE ($1::integer IS NOT NULL AND id = $1)
        OR ($1::integer IS NULL AND application_id = $2::uuid)
     ORDER BY CASE WHEN $1::integer IS NOT NULL AND id = $1 THEN 0 ELSE 1 END, id DESC
     LIMIT 1
  `,

  UPDATE_PAYMENT_STATUS: `
    UPDATE payment
       SET status = $2,
           finished = true,
           updated_at = NOW()
     WHERE id = $1
     RETURNING id, application_id, status
  `,

  FIND_DESNZ_REF_BY_APPLICATION_ID: 'SELECT desnz_ref FROM application WHERE application_id = $1',

  GET_PAYMENT_STATUS: 'SELECT status FROM payment WHERE id = $1',

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
