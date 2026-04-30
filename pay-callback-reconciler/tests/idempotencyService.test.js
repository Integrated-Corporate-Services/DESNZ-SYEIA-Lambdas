/**
 * Tests for Idempotency Service
 */

import { checkAndRecordIdempotency } from '../idempotencyService.js';
import { recordIdempotentEvent, findEventById } from '../database/idempotencyRepository.js';

jest.mock('../database/idempotencyRepository.js');
jest.mock('../util/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

describe('IdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndRecordIdempotency', () => {
    test('should return isDuplicate: false for new event', async () => {
      recordIdempotentEvent.mockResolvedValue(true); // Event inserted successfully

      const result = await checkAndRecordIdempotency(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );

      expect(result.isDuplicate).toBe(false);
      expect(recordIdempotentEvent).toHaveBeenCalledWith(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );
    });

    test('should return isDuplicate: true for existing event', async () => {
      const existingEvent = {
        event_id: 'evt_123',
        govuk_pay_id: 'pay_456',
        processed: true,
      };

      recordIdempotentEvent.mockResolvedValue(false); // Event already exists
      findEventById.mockResolvedValue(existingEvent);

      const result = await checkAndRecordIdempotency(
        'evt_123',
        'pay_456',
        'payment.confirmed',
        { amount: 1000 },
        '2026-04-24T10:00:00Z'
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.event).toEqual(existingEvent);
      expect(findEventById).toHaveBeenCalledWith('evt_123');
    });

    test('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      recordIdempotentEvent.mockRejectedValue(dbError);

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
