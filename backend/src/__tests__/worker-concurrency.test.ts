/**
 * Worker concurrency & reliability unit tests.
 * All logic imported from the REAL implementation in utils/jobUtils.ts —
 * so these tests would catch a bug in production code, not just in a copy.
 */
import {
  calculateRetryDelay,
  canClaimJob,
  shouldMoveToDLQ,
  sortJobsByPriority,
  type MinJob,
} from '../utils/jobUtils';

// ── Retry delay strategies ────────────────────────────────────────────────────

describe('calculateRetryDelay (from utils/jobUtils)', () => {
  describe('FIXED strategy', () => {
    it('always returns the base delay regardless of attempt', () => {
      expect(calculateRetryDelay('FIXED', 1000, 1)).toBe(1000);
      expect(calculateRetryDelay('FIXED', 1000, 5)).toBe(1000);
      expect(calculateRetryDelay('FIXED', 500,  10)).toBe(500);
    });
  });

  describe('LINEAR strategy', () => {
    it('multiplies base delay by attempt number', () => {
      expect(calculateRetryDelay('LINEAR', 1000, 1)).toBe(1000);
      expect(calculateRetryDelay('LINEAR', 1000, 3)).toBe(3000);
      expect(calculateRetryDelay('LINEAR', 500,  4)).toBe(2000);
    });
  });

  describe('EXPONENTIAL strategy', () => {
    it('doubles delay with each attempt (baseDelay × 2^(attempt-1))', () => {
      expect(calculateRetryDelay('EXPONENTIAL', 1000, 1)).toBe(1000);  // × 2^0
      expect(calculateRetryDelay('EXPONENTIAL', 1000, 2)).toBe(2000);  // × 2^1
      expect(calculateRetryDelay('EXPONENTIAL', 1000, 3)).toBe(4000);  // × 2^2
      expect(calculateRetryDelay('EXPONENTIAL', 1000, 4)).toBe(8000);  // × 2^3
    });
  });

  it('unknown strategy falls back to base delay (FIXED behaviour)', () => {
    expect(calculateRetryDelay('UNKNOWN', 750, 5)).toBe(750);
  });
});

// ── Concurrency gate ──────────────────────────────────────────────────────────

describe('canClaimJob (from utils/jobUtils)', () => {
  it('allows claim when under concurrency limit and queue is active', () => {
    expect(canClaimJob(2, 5, false)).toBe(true);
    expect(canClaimJob(0, 1, false)).toBe(true);
  });

  it('blocks claim exactly at the concurrency limit', () => {
    expect(canClaimJob(5, 5, false)).toBe(false);
  });

  it('blocks claim when queue is paused', () => {
    expect(canClaimJob(0, 5, true)).toBe(false);
  });

  it('blocks when both paused and at limit', () => {
    expect(canClaimJob(5, 5, true)).toBe(false);
  });

  it('blocks when active count exceeds limit (defensive)', () => {
    expect(canClaimJob(10, 5, false)).toBe(false);
  });
});

// ── DLQ promotion gate ────────────────────────────────────────────────────────

describe('shouldMoveToDLQ (from utils/jobUtils)', () => {
  it('does not move to DLQ while retries remain', () => {
    expect(shouldMoveToDLQ(0, 3)).toBe(false);
    expect(shouldMoveToDLQ(2, 3)).toBe(false);
    expect(shouldMoveToDLQ(3, 3)).toBe(false);
  });

  it('moves to DLQ once retryCount exceeds maxRetries', () => {
    expect(shouldMoveToDLQ(4, 3)).toBe(true);
  });

  it('handles zero maxRetries correctly', () => {
    expect(shouldMoveToDLQ(0, 0)).toBe(false);
    expect(shouldMoveToDLQ(1, 0)).toBe(true);
  });
});

// ── Priority ordering (FIFO within same priority) ─────────────────────────────

describe('sortJobsByPriority (from utils/jobUtils)', () => {
  const now = Date.now();

  const jobs: MinJob[] = [
    { id: 'a', priority: 0,  createdAt: new Date(now + 200) },
    { id: 'b', priority: 10, createdAt: new Date(now + 100) },
    { id: 'c', priority: 5,  createdAt: new Date(now + 300) },
    { id: 'd', priority: 10, createdAt: new Date(now + 50)  },
  ];

  it('sorts by priority descending', () => {
    const sorted = sortJobsByPriority(jobs);
    expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[1].priority);
    expect(sorted[1].priority).toBeGreaterThanOrEqual(sorted[2].priority);
    expect(sorted[2].priority).toBeGreaterThanOrEqual(sorted[3].priority);
  });

  it('breaks ties by creation time ascending (FIFO)', () => {
    const sorted = sortJobsByPriority(jobs);
    // d and b both have priority 10; d was created earlier → d first
    expect(sorted[0].id).toBe('d');
    expect(sorted[1].id).toBe('b');
  });

  it('does not mutate the original array', () => {
    const original = [...jobs];
    sortJobsByPriority(jobs);
    expect(jobs).toEqual(original);
  });

  it('handles a single job without errors', () => {
    const single: MinJob[] = [{ id: 'x', priority: 5, createdAt: new Date() }];
    expect(sortJobsByPriority(single)).toHaveLength(1);
  });

  it('handles an empty array', () => {
    expect(sortJobsByPriority([])).toEqual([]);
  });
});
