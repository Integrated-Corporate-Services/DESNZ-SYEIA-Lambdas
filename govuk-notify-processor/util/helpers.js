/**
 * Helper Utilities
 * 
 * General-purpose utility functions
 * - Sleep/delay
 * - UUID validation
 * - Date formatting
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique idempotency key
 * @param {string} prefix - Prefix for the key
 * @param {string} identifier - Unique identifier
 * @returns {string} - Idempotency key
 */
export function generateIdempotencyKey(prefix, identifier) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${prefix}-${identifier}-${date}`;
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
export function truncate(str, maxLength = 100) {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Safe JSON parse (returns null on error)
 * @param {string} json - JSON string
 * @returns {object|null} - Parsed object or null
 */
export function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
