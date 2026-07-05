/**
 * Shared job utilities — exported so both the worker process and tests
 * import the SAME implementation rather than redefining copies inline.
 */

/**
 * Calculate retry delay based on strategy.
 * FIXED:       always baseDelay
 * LINEAR:      baseDelay × attempt
 * EXPONENTIAL: baseDelay × 2^(attempt-1)
 */
export function calculateRetryDelay(
  strategy: string,
  baseDelay: number,
  attempt: number
): number {
  switch (strategy) {
    case 'LINEAR':      return baseDelay * attempt;
    case 'EXPONENTIAL': return baseDelay * Math.pow(2, attempt - 1);
    default:            return baseDelay; // FIXED
  }
}

/**
 * Concurrency gate — returns true if a worker is allowed to claim a job.
 * Mirrors the check inside the atomic transaction so it can be unit tested.
 */
export function canClaimJob(
  activeCount: number,
  concurrencyLimit: number,
  isPaused: boolean
): boolean {
  return !isPaused && activeCount < concurrencyLimit;
}

/**
 * DLQ promotion gate — returns true when a job has exhausted all retries.
 */
export function shouldMoveToDLQ(retryCount: number, maxRetries: number): boolean {
  return retryCount > maxRetries;
}

/**
 * Sort jobs by priority DESC, then createdAt ASC (FIFO within same priority).
 */
export interface MinJob {
  id: string;
  priority: number;
  createdAt: Date;
}

export function sortJobsByPriority<T extends MinJob>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) =>
    b.priority !== a.priority
      ? b.priority - a.priority
      : a.createdAt.getTime() - b.createdAt.getTime()
  );
}
