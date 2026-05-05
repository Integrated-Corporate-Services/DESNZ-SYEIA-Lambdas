/**
 * Tests for Signature Validator
 */

import { validateSignature } from '../../src/validators/signatureValidator.js';
import crypto from 'crypto';

jest.mock('../../src/util/logger.js', () => ({
  default: {
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('SignatureValidator', () => {
  const secret = 'test-webhook-secret';
  const payload = '{"webhook_id":"evt_123","event_type":"payment.confirmed"}';

  test('should validate correct signature', () => {
    const signature = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const result = validateSignature(payload, signature, secret);
    expect(result).toBe(true);
  });

  test('should reject incorrect signature', () => {
    const wrongSignature = 'incorrect_signature_value';

    const result = validateSignature(payload, wrongSignature, secret);
    expect(result).toBe(false);
  });

  test('should reject when signature is missing', () => {
    const result = validateSignature(payload, null, secret);
    expect(result).toBe(false);
  });

  test('should reject when secret is missing', () => {
    const signature = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const result = validateSignature(payload, signature, null);
    expect(result).toBe(false);
  });

  test('should reject when payload is missing', () => {
    const signature = 'some_signature';
    const result = validateSignature(null, signature, secret);
    expect(result).toBe(false);
  });

  test('should use timing-safe comparison', () => {
    const signature = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Modify one character
    const tamperedSignature = signature.substring(0, signature.length - 1) + '0';

    const result = validateSignature(payload, tamperedSignature, secret);
    expect(result).toBe(false);
  });
});
