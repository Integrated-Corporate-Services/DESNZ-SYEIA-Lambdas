import { PAYMENT_TABLE_PROVIDER } from '../util/paymentStatus.mapper';

export const paymentQueries = {
  FIND_APPLICATION_BY_INVOICE_NUMBER: `
    SELECT application_id, invoice_number, payment_method, amount_pence
      FROM invoice
     WHERE invoice_number = $1
     LIMIT 1
  `,

  UPDATE_PAYMENT_STATUS_BY_APPLICATION_ID: `
    UPDATE payment
       SET status = $2,
           finished = true
     WHERE application_id = $1
       AND LOWER(provider) = '${PAYMENT_TABLE_PROVIDER.BACS}'
     RETURNING id, application_id, status
  `,

  FIND_DESNZ_REF_BY_APPLICATION_ID: 'SELECT desnz_ref FROM application WHERE application_id = $1',

  GET_PAYMENT_STATUS: 'SELECT status FROM payment WHERE application_id = $1 ORDER BY id DESC LIMIT 1',

  MARK_WEBHOOK_PROCESSED: `
    UPDATE payment_webhooks
    SET
      status = 'PROCESSED',
      updated_at = NOW(),
      updated_by = $2
    WHERE webhook_id = $1
      AND status != 'PROCESSED'
  `,

  FIND_WEBHOOK_BY_ID: 'SELECT webhook_id, status FROM payment_webhooks WHERE webhook_id = $1',
};
