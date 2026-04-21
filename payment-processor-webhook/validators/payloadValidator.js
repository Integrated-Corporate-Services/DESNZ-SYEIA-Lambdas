export function validatePayload(payload) {
  const errors = [];
  if (!payload.type) errors.push('Missing: type');
  if (!payload.timestamp) errors.push('Missing: timestamp');
  if (!payload.data?.id) errors.push('Missing: data.id');
  
  const validTypes = ['payment.confirmed', 'payment.captured', 'payment.settled', 'payment.failed', 'payment.expired', 'payment.refunded'];
  if (!validTypes.includes(payload.type)) errors.push(`Invalid type: ${payload.type}`);
  
  return { valid: errors.length === 0, errors };
}
