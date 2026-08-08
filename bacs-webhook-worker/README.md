# BACS Webhook Worker Lambda

AWS Lambda function for processing BACS payment webhook notifications.

## Project Structure

```
bacs-webhook-worker/
├── src/
│   ├── config/              # Configuration management
│   ├── constants/           # Application constants
│   ├── errors/              # Custom error classes
│   ├── queries/             # SQL query definitions (for future use)
│   ├── repositories/        # Data access layer
│   ├── services/            # Business logic
│   ├── types/               # TypeScript type definitions
│   └── util/                # Utility functions
│
├── tests/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
│
├── handler.ts               # AWS Lambda handler
├── index.ts                 # Entry point
└── package.json             # Dependencies
```

## Setup

### Prerequisites
- Node.js 20+
- npm 10+

### Installation

```bash
npm install
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Development

Run the handler locally (requires TypeScript):

```bash
npm run run-local
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### All Tests

```bash
npm test
```

### Code Quality

Run ESLint:

```bash
npm run lint
```

## Environment Variables

Create a `.env` file with the following variables:

```env
NODE_ENV=dev
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=syeia
SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name
LOG_LEVEL=info
```

## AWS Deployment

### Build for Deployment

```bash
npm run clean
npm run build
```

This generates JavaScript files from TypeScript sources.

### Package

Zip the following files for AWS Lambda:

- `handler.js`
- `node_modules/` (installed dependencies)
- `src/` (source files if included)

```bash
zip -r lambda.zip handler.js node_modules/ src/
```

### Lambda Configuration

- **Handler:** `handler.handler`
- **Runtime:** Node.js 20.x
- **Memory:** 256 MB (minimum recommended)
- **Timeout:** 60 seconds (adjust based on workload)
- **Trigger:** SQS Queue

## Architecture

### Data Flow

```
SQS Message
    ↓
handler.ts (Lambda entry point)
    ↓
worker.service.ts (processes records)
    ↓
payment.repository.ts (database access)
    ↓
PostgreSQL Database
```

### Components

- **handler.ts** - AWS Lambda handler, processes SQS events
- **worker.service.ts** - Main business logic for processing payments
- **payment.repository.ts** - Database access layer for payment records
- **env.config.ts** - Environment variable validation
- **logger.ts** - Structured logging

## Error Handling

Custom error classes are used for specific error scenarios:

- `ValidationError` - Invalid input data (HTTP 400)
- `DatabaseError` - Database connection/query errors (HTTP 500)
- `PaymentProcessingError` - Payment processing failures (HTTP 500)

## Logging

Structured JSON logging is used throughout. Configure log level via `LOG_LEVEL` environment variable:

- `debug` - Detailed debugging information
- `info` - General information
- `warn` - Warning messages
- `error` - Error messages (always logged)

## Database Schema

Expected table structure for payments:

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run prepare` - Run before publishing (runs build)
- `npm run clean` - Remove build artifacts
- `npm run lint` - Run ESLint
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run run-local` - Run handler locally (requires ts-node)

## Development

### Adding New Modules

1. Create file in appropriate `src/` subdirectory
2. Export functions/classes
3. Create corresponding test file
4. Run `npm run lint` to check code quality
5. Run `npm test` to verify tests pass

### Adding Dependencies

```bash
npm install package-name
npm install --save-dev @types/package-name
```

## Troubleshooting

### Build Errors

Ensure TypeScript configuration is correct:

```bash
npm run lint
npm run build
```

### Test Failures

Clear mock cache and rerun tests:

```bash
npm test -- --clearCache
```

### Database Connection Issues

Verify environment variables:

```bash
echo $DB_HOST $DB_PORT $DB_USER $DB_NAME
```

Test connection locally if possible.

## License

See LICENSE file in parent directory.
