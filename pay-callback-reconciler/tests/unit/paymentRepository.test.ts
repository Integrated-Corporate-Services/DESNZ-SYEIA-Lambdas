/**
 * Tests for Payment Repository - SQL injection prevention
 */

import { updatePaymentWithOrdering } from '../../src/database/paymentRepository.js';
import { query } from '../../src/util/database.js';
import type { UpdatePaymentData } from '../../src/types/index.js';

jest.mock('../../src/util/database.js');

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('PaymentRepository - Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updatePaymentWithOrdering', () => {
    test('should allow valid fields', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ govuk_pay_id: 'pay_123', status: 'confirmed' }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      const updates: UpdatePaymentData = {
        status: 'confirmed',
        event_history: ['payment.confirmed'],
        event_count: 1,
      };

      await updatePaymentWithOrdering('pay_123', updates);

      expect(mockQuery).toHaveBeenCalled();
      const calledQuery = mockQuery.mock.calls[0][0];
      expect(calledQuery).toContain('UPDATE payments SET');
      expect(calledQuery).toContain('status = $1');
    });

    test('should prevent SQL injection via malicious field names', async () => {
      const updates: any = {
        'status; DROP TABLE payments; --': 'confirmed',
        validField: 'value',
      };

      await expect(updatePaymentWithOrdering('pay_123', updates))
        .rejects
        .toThrow('No valid fields to update');
    });

    test('should filter out non-whitelisted fields', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ govuk_pay_id: 'pay_123', status: 'confirmed' }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      const updates: any = {
        status: 'confirmed',
        maliciousField: 'should be ignored',
        unknownField: 'also ignored',
      };

      await updatePaymentWithOrdering('pay_123', updates);

      const calledQuery = mockQuery.mock.calls[0][0];
      expect(calledQuery).not.toContain('maliciousField');
      expect(calledQuery).not.toContain('unknownField');
      expect(calledQuery).toContain('status');
    });

    test('should throw error when no valid fields provided', async () => {
      const updates: any = {
        invalidField1: 'value1',
        invalidField2: 'value2',
      };

      await expect(updatePaymentWithOrdering('pay_123', updates))
        .rejects
        .toThrow('No valid fields to update');
    });
  });
});
