/**
 * Rate limiting utility for authentication endpoints
 * Implements exponential backoff and IP-based tracking
 */

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blockedUntil: number | null;
}

// In-memory store: IP -> RateLimitEntry
// In production with multiple instances, consider using Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BASE_BLOCK_DURATION_MS = 60 * 1000; // 1 minute base block duration
const MAX_BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour maximum block duration
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean up old entries every hour

// Track last cleanup time
let lastCleanup = Date.now();

/**
 * Get client IP address from request, handling proxies
 */
export function getClientIP(
  request: Request,
  event?: { getClientAddress?: () => string }
): string {
  // Try to use SvelteKit's getClientAddress if available
  if (event?.getClientAddress) {
    return event.getClientAddress();
  }

  // Fallback: check headers for proxy-forwarded IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Last resort: use request URL (may not be accurate behind proxies)
  try {
    const url = new URL(request.url);
    return url.hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Calculate exponential backoff duration
 */
function calculateBlockDuration(attempts: number): number {
  // Exponential backoff: 2^(attempts - MAX_ATTEMPTS) * BASE_BLOCK_DURATION_MS
  // Cap at MAX_BLOCK_DURATION_MS
  const exponent = Math.max(0, attempts - MAX_ATTEMPTS);
  const duration = Math.min(
    BASE_BLOCK_DURATION_MS * Math.pow(2, exponent),
    MAX_BLOCK_DURATION_MS
  );
  return duration;
}

/**
 * Clean up old rate limit entries
 */
function cleanupOldEntries(): void {
  const now = Date.now();
  const maxAge = WINDOW_MS * 2; // Keep entries for 2x the window

  for (const [ip, entry] of rateLimitStore.entries()) {
    // Remove if:
    // 1. Entry is older than maxAge AND
    // 2. Not currently blocked
    const age = now - entry.firstAttempt;
    const isExpired = age > maxAge;
    const isNotBlocked =
      entry.blockedUntil === null || now > entry.blockedUntil;

    if (isExpired && isNotBlocked) {
      rateLimitStore.delete(ip);
    }
  }

  lastCleanup = now;
}

/**
 * Check if an IP is rate limited
 * @returns Object indicating if blocked and current attempt count
 */
export function checkRateLimit(
  ip: string,
  isFailedAttempt: boolean
):
  | { blocked: false; attempts: number }
  | { blocked: true; retryAfter: number; attempts: number } {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupOldEntries();
  }

  let entry = rateLimitStore.get(ip);

  // Initialize entry if it doesn't exist
  if (!entry) {
    entry = {
      attempts: 0,
      firstAttempt: now,
      lastAttempt: now,
      blockedUntil: null,
    };
    rateLimitStore.set(ip, entry);
  }

  // Check if currently blocked
  if (entry.blockedUntil !== null && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    return {
      blocked: true,
      retryAfter,
      attempts: entry.attempts,
    };
  }

  // Reset block if expired
  if (entry.blockedUntil !== null && now >= entry.blockedUntil) {
    entry.blockedUntil = null;
  }

  // Check if window has expired (reset attempts)
  const windowAge = now - entry.firstAttempt;
  if (windowAge > WINDOW_MS) {
    entry.attempts = 0;
    entry.firstAttempt = now;
    entry.blockedUntil = null;
  }

  // If this is a failed attempt, increment counter
  if (isFailedAttempt) {
    entry.attempts += 1;
    entry.lastAttempt = now;

    // If exceeded max attempts, apply block
    if (entry.attempts >= MAX_ATTEMPTS) {
      const blockDuration = calculateBlockDuration(entry.attempts);
      entry.blockedUntil = now + blockDuration;

      const retryAfter = Math.ceil(blockDuration / 1000);
      return {
        blocked: true,
        retryAfter,
        attempts: entry.attempts,
      };
    }
  }

  // Reset attempts on successful login
  if (!isFailedAttempt && entry.attempts > 0) {
    entry.attempts = 0;
    entry.firstAttempt = now;
    entry.blockedUntil = null;
  }

  return { blocked: false, attempts: entry.attempts };
}

/**
 * Log failed login attempt for monitoring
 */
export function logFailedLoginAttempt(ip: string, attempts: number): void {
  console.warn(
    `[RATE_LIMIT] Failed login attempt from IP: ${ip}, Attempts: ${attempts}/${MAX_ATTEMPTS}`
  );
}

/**
 * Get rate limit status for an IP (for debugging/monitoring)
 */
export function getRateLimitStatus(ip: string): {
  attempts: number;
  blockedUntil: number | null;
  retryAfter: number | null;
} | null {
  const entry = rateLimitStore.get(ip);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  const retryAfter =
    entry.blockedUntil && now < entry.blockedUntil
      ? Math.ceil((entry.blockedUntil - now) / 1000)
      : null;

  return {
    attempts: entry.attempts,
    blockedUntil: entry.blockedUntil,
    retryAfter,
  };
}
