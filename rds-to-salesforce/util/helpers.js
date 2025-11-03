export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function backoffSeconds(attempt) {
  // Exponential (30s, 60s, 120s, ...), cap at 6h
  return Math.min(Math.pow(2, Math.max(0, attempt - 1)) * 30, 6 * 60 * 60);
}

export function cutoffNowPlus(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function safeJsonParse(x) {
  if (!x) return null;
  try {
    return typeof x === "string" ? JSON.parse(x) : x;
  } catch {
    return null;
  }
}
