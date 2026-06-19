export const webhookQueries = {
  markProcessed: `
    UPDATE payment_webhooks
    SET status = $1, updated_at = NOW()
    WHERE webhook_id = $2
  `,

  markFailed: `
    UPDATE payment_webhooks
    SET status = $1, updated_at = NOW()
    WHERE webhook_id = $2
  `,
};
