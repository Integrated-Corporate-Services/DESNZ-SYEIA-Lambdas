// CommonJS Lambda handler for LocalStack compatibility
// Simplified version that writes directly to PostgreSQL without complex dependencies

const { Client } = require('pg');

// Logger utility
function log(level, message, data = {}) {
  console.log(JSON.stringify({ level, message, ...data, timestamp: new Date().toISOString() }));
}

// Database connection
async function getDbClient() {
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'appdb',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  
  await client.connect();
  return client;
}

// Process single SQS message
async function processSQSMessage(record) {
  const messageId = record.messageId;
  let client;
  
  try {
    // Parse message body
    const messageBody = JSON.parse(record.body);
    const { webhook, metadata } = messageBody;
    
    const webhookId = metadata?.webhookId || webhook?.webhook_message_id;
    const paymentId = metadata?.paymentId || webhook?.resource?.payment_id;
    const eventType = metadata?.eventType || webhook?.event_type;
    
    log('info', '[Lambda] Processing webhook', { webhookId, paymentId, eventType, messageId });
    
    // Connect to database
    client = await getDbClient();
    
    // Update webhook status to processing
    await client.query(
      `UPDATE payment_webhooks 
       SET status = 'processing', updated_at = NOW() 
       WHERE webhook_id = $1`,
      [webhookId]
    );
    
    log('info', '[Lambda] Webhook status updated to processing', { webhookId });
    
    // Map event type to final status
    let finalStatus = 'success';
    let paymentFinished = false;
    
    if (eventType) {
      if (eventType.includes('failed')) {
        finalStatus = 'failed';
        paymentFinished = true;
      } else if (eventType.includes('cancelled')) {
        finalStatus = 'failed';
        paymentFinished = true;
      } else if (eventType.includes('error')) {
        finalStatus = 'error';
        paymentFinished = true;
      } else if (eventType.includes('succeeded') || eventType.includes('captured')) {
        finalStatus = 'success';
        paymentFinished = true;
      }
    }
    
    log('info', '[Lambda] Determined final status', { webhookId, eventType, finalStatus, paymentFinished });
    
    // Update payment table status (if payment exists)
    try {
      const paymentUpdateResult = await client.query(
        `UPDATE payment 
         SET status = $2, finished = $3 
         WHERE payment_id = $1 
         RETURNING payment_id, status, finished`,
        [paymentId, finalStatus, paymentFinished]
      );
      
      if (paymentUpdateResult.rowCount > 0) {
        log('info', '[Lambda] Payment status updated', { 
          paymentId, 
          status: finalStatus, 
          finished: paymentFinished 
        });
      } else {
        log('warn', '[Lambda] Payment not found in database', { paymentId });
      }
    } catch (paymentError) {
      log('warn', '[Lambda] Failed to update payment status', { 
        paymentId, 
        error: paymentError.message 
      });
      // Continue processing even if payment update fails
    }
    
    // Update webhook with final status based on event type
    await client.query(
      `UPDATE payment_webhooks 
       SET status = $2, updated_at = NOW() 
       WHERE webhook_id = $1`,
      [webhookId, finalStatus]
    );
    
    log('info', '[Lambda] Webhook processed successfully', { 
      webhookId, 
      paymentId, 
      finalStatus,
      processingTimeMs: Date.now() - Date.parse(messageBody.metadata?.timestamp || new Date().toISOString())
    });
    
    return { success: true, webhookId, paymentId, finalStatus };
    
  } catch (error) {
    log('error', '[Lambda] Error processing message', {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
    // Update webhook status to failed if we have the ID
    if (client) {
      try {
        const messageBody = JSON.parse(record.body);
        const webhookId = messageBody?.metadata?.webhookId || messageBody?.webhook?.webhook_message_id;
        if (webhookId) {
          await client.query(
            `UPDATE payment_webhooks 
             SET status = 'failed', error_message = $2, updated_at = NOW() 
             WHERE webhook_id = $1`,
            [webhookId, error.message]
          );
        }
      } catch (updateError) {
        log('error', '[Lambda] Failed to update webhook status', { error: updateError.message });
      }
    }
    
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  const requestId = context?.requestId || context?.awsRequestId || 'unknown';
  const startTime = Date.now();
  
  log('info', '[Lambda] Handler invoked', {
    requestId,
    recordCount: event.Records?.length || 0
  });
  
  try {
    // Validate SQS event
    if (!event.Records || !Array.isArray(event.Records)) {
      throw new Error('Invalid event: Expected SQS event with Records array');
    }
    
    // Process each record
    const results = [];
    const failures = [];
    
    for (const record of event.Records) {
      try {
        const result = await processSQSMessage(record);
        results.push(result);
      } catch (error) {
        log('error', '[Lambda] Record processing failed', {
          messageId: record.messageId,
          error: error.message
        });
        failures.push({
          itemIdentifier: record.messageId
        });
      }
    }
    
    log('info', '[Lambda] Batch processing complete', {
      requestId,
      total: event.Records.length,
      succeeded: results.length,
      failed: failures.length,
      duration: Date.now() - startTime
    });
    
    // Return partial batch failure response
    return {
      batchItemFailures: failures
    };
    
  } catch (error) {
    log('error', '[Lambda] Handler error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};
