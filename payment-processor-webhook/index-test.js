// Minimal test Lambda to verify SQS integration
export const handler = async (event, context) => {
  console.log('Lambda triggered!');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  if (!event.Records) {
    console.log('ERROR: No SQS records found');
    return { statusCode: 400, body: 'Not an SQS event' };
  }
  
  for (const record of event.Records) {
    console.log('Processing message:', record.messageId);
    console.log('Message body:', record.body);
    
    try {
      const messageBody = JSON.parse(record.body);
      console.log('Webhook data:', JSON.stringify(messageBody, null, 2));
      console.log('Payment ID:', messageBody.metadata?.paymentId);
      console.log('Event Type:', messageBody.metadata?.eventType);
    } catch (err) {
      console.log('Error parsing message:', err.message);
    }
  }
  
  return { statusCode: 200, body: 'Processed' };
};
