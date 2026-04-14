const LIMIT = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR, 10) || 60;
const WINDOW_MS = 60 * 60 * 1000;

const buckets = new Map();

function check(userKey) {
  const now = Date.now();
  const bucket = buckets.get(userKey) || { count: 0, windowStart: now };
  if (now - bucket.windowStart > WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  if (bucket.count >= LIMIT) {
    const retryAfterSec = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec, limit: LIMIT };
  }
  bucket.count += 1;
  buckets.set(userKey, bucket);
  return { allowed: true, remaining: LIMIT - bucket.count, limit: LIMIT };
}

module.exports = { check };
