/**
 * Exponential backoff utility for handling retries with increasing delays
 */

export interface BackoffOptions {
  /** Initial delay in milliseconds (default: 2000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Multiplier for each retry (default: 2) */
  multiplier?: number;
}

export class ExponentialBackoff {
  private consecutiveFailures = 0;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly multiplier: number;

  constructor(options: BackoffOptions = {}) {
    this.initialDelay = options.initialDelay ?? 2000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.multiplier = options.multiplier ?? 2;
  }

  /**
   * Get the current delay based on consecutive failures
   */
  getDelay(): number {
    if (this.consecutiveFailures === 0) {
      return this.initialDelay;
    }
    const delay =
      this.initialDelay *
      Math.pow(this.multiplier, this.consecutiveFailures - 1);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Record a failure and return the delay for the next retry
   */
  recordFailure(): number {
    this.consecutiveFailures++;
    return this.getDelay();
  }

  /**
   * Record a success and reset the failure count
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Reset the failure count manually
   */
  reset(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Get the current failure count
   */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }
}
