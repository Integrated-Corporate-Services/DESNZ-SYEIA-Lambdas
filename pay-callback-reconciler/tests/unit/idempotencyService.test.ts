/**
 * Tests for Idempotency Service
 */

import { checkAndRecordIdempotency } from '../../src/services/idempotencyService.js';
import { recordIdempotentEvent, findEventById } from '../../src/database/idempotencyRepository.js';
import type { PaymentEvent } from '../../src/types/index.js';

jest.mock('../../src/database/idempotencyRepository.js');
jest.mock('../../src/util/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockRecordIdempotentEvent = recordIdempotentEvent as jest.MockedFunction<typeof recordIdempotentEvent>;
const mockFindEventById = findEventById as jest.MockedFunction<typeof findEventById>;

describe('IdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndRecordIdempotency', () => {
    test('should return isDuplicate: false for new event', async () => {
      mockRecordIdempotentEvent.mockResolvedValue(true); // Event inserted successfully

      const result = await checkAndRecordIdempotency(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );

      expect(result.isDuplicate).toBe(false);
      expect(mockRecordIdempotentEvent).toHaveBeenCalledWith(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );
    });

    test('should return isDuplicate: true for existing event', async () => {
      const existingEvent: PaymentEvent = {
        event_id: 'evt_123',
        payment_id: 'pay_456',
        event_type: 'payment.confirmed',
        event_data: { amount: 1000 },
        event_timestamp: '2026-04-24T10:00:00Z',
        processed: true,
        received_at: new Date('2026-04-24T10:00:00Z'),
        created_at: new Date('2026-04-24T10:00:00Z'),
      };

      mockRecordIdempotentEvent.mockResolvedValue(false); // Event already exists
      mockFindEventById.mockResolvedValue(existingEvent);

      const result = await checkAndRecordIdempotency(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.event).toEqual(existingEvent);
      expect(mockFindEventById).toHaveBeenCalledWith('evt_123');
    });

    test('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockRecordIdempotentEvent.mockRejectedValue(dbError);

      await expect(
        checkAndRecordIdempotency(
          'evt_123',
          'pay_456',
          'payment.confirmed',
          { amount: 1000 },
          '2026-04-24T10:00:00Z'
        )
      ).rejects.toThrow('Database connection failed');
    });
  });
});
