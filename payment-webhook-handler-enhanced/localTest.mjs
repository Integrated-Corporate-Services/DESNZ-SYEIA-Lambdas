import { handler } from './handler.js';

// Mock test event
const mockEvent = {
  requestContext: {
    http: {
      method: 'POST'
    }
  },
  headers: {
    'X-Gov-Uk-Pay-Signature': 'mock-signature'
  },
  body: JSON.stringify({
    type: 'payment.confirmed',
    timestamp: new Date().toISOString(),
    event_id: 'test-' + Date.now(),
    data: {
      id: 'pay_test_123',
      status: 'success',
      amount: 10000,
      trans_id: 'ch_test_123',
      email: 'test@example.com'
    }
  })
};

const mockContext = {
  requestId: 'req-test-' + Date.now()
};

async function runLocalTest() {
  console.log('🧪 Running Lambda local test...\n');
  console.log('📨 Event:', JSON.stringify(mockEvent, null, 2));
  
  try {
    const response = await handler(mockEvent, mockContext);
    console.log('\n✅ Handler executed successfully!');
    console.log('📤 Response:', JSON.stringify(response, null, 2));
    
    if (response.statusCode === 202) {
      console.log('\n✅ Correct response code (202 Accepted)');
    } else {
      console.log(`\n⚠️ Response code: ${response.statusCode} (expected 202)`);
    }
  } catch (err) {
    console.error('\n❌ Handler error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runLocalTest();
