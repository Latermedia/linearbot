import { RateLimitError } from "../../../linear/client.js";

/**
 * Shared cancellation flag type
 */
export interface CancellationFlag {
  value: boolean;
}

/**
 * Handle rate limit error by setting cancellation flag and rethrowing
 */
export function handleRateLimitError(
  error: unknown,
  cancelled: CancellationFlag
): never {
  if (error instanceof RateLimitError) {
    cancelled.value = true;
    throw error;
  }
  throw error;
}

/**
 * Check Promise.allSettled results for rate limit errors
 * Returns the rate limit error if found, null otherwise
 */
export function checkForRateLimitError(
  results: PromiseSettledResult<unknown>[]
): RateLimitError | null {
  const rateLimitError = results.find(
    (r) =>
      r.status === "rejected" &&
      (r.reason instanceof RateLimitError ||
        (r.reason instanceof Error && r.reason.message.includes("rate limit")))
  );

  if (rateLimitError && rateLimitError.status === "rejected") {
    const error = rateLimitError.reason;
    if (error instanceof RateLimitError) {
      return error;
    }
    return new RateLimitError(
      error instanceof Error ? error.message : "Rate limit exceeded"
    );
  }

  return null;
}

/**
 * Process Promise.allSettled results, filtering out rejected promises
 * Returns array of successful results
 */
export function processSettledResults<T>(
  results: PromiseSettledResult<T>[]
): T[] {
  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v) => v !== null) as T[];
}
