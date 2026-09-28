// Jest Setup - Runs before all tests

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5435/syeia_db_test';

// AWS Configuration (LocalStack)
process.env.AWS_REGION = 'eu-west-2';
process.env.AWS_ENDPOINT = 'http://localhost:4567';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

// Casework event processor configuration
process.env.CASEWORK_FATAL_QUEUE_URL = 'http://localhost:4567/000000000000/casework-events-fatal-dlq';
process.env.DB_POOL_MAX = '5';

process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
