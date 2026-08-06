// Jest Setup - Runs before all tests

process.env.NODE_ENV = 'test';
process.env.HOST_NAME = 'localhost';
process.env.DB_NAME = 'syeia_db_test';
process.env.DB_PORT = '5435';
process.env.DB_CREDENTIALS = '{"username":"postgres","password":"postgres"}';

// AWS Configuration (LocalStack)
process.env.REGION = 'eu-west-2';
process.env.AWS_ENDPOINT = 'http://localhost:4567';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

// Notify Configuration
process.env.SQS_QUEUE_URL = 'http://localhost:4567/000000000000/notify-callbacks-queue';
process.env.NOTIFY_RELAY_BATCH_SIZE = '50';
process.env.DB_POOL_MAX = '5';

process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
