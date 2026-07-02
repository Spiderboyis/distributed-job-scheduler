import { describe, it, expect } from 'vitest';
import { calculateRetryDelay, shouldRetry, RetryPolicy } from '../src/utils/retry.js';

describe('Retry Strategy Calculator', () => {
  // ── Fixed Strategy ──────────────────────────────────────
  describe('Fixed Strategy', () => {
    const policy: RetryPolicy = {
      strategy: 'fixed',
      max_retries: 3,
      initial_delay: 5000,
      max_delay: 5000,
      backoff_factor: 1.0,
    };

    it('should return constant delay for all attempts', () => {
      const d0 = calculateRetryDelay(policy, 0);
      const d1 = calculateRetryDelay(policy, 1);
      const d2 = calculateRetryDelay(policy, 2);
      // Within ±10% jitter of 5000
      expect(d0).toBeGreaterThanOrEqual(4500);
      expect(d0).toBeLessThanOrEqual(5500);
      expect(d1).toBeGreaterThanOrEqual(4500);
      expect(d2).toBeGreaterThanOrEqual(4500);
    });

    it('should return -1 when retries exhausted', () => {
      expect(calculateRetryDelay(policy, 3)).toBe(-1);
      expect(calculateRetryDelay(policy, 5)).toBe(-1);
    });
  });

  // ── Linear Strategy ─────────────────────────────────────
  describe('Linear Strategy', () => {
    const policy: RetryPolicy = {
      strategy: 'linear',
      max_retries: 5,
      initial_delay: 2000,
      max_delay: 60000,
      backoff_factor: 1.0,
    };

    it('should increase delay linearly', () => {
      const d0 = calculateRetryDelay(policy, 0); // 2000
      const d1 = calculateRetryDelay(policy, 1); // 4000
      const d2 = calculateRetryDelay(policy, 2); // 6000
      // Verify increasing trend (accounting for jitter)
      expect(d0).toBeLessThan(d2 + 1000); // rough check
      expect(d1).toBeGreaterThan(2500);
      expect(d2).toBeGreaterThan(4500);
    });

    it('should cap at max_delay', () => {
      const policySmallMax: RetryPolicy = { ...policy, max_delay: 3000, max_retries: 10 };
      const d5 = calculateRetryDelay(policySmallMax, 5); // 12000, capped to 3000
      expect(d5).toBeLessThanOrEqual(3300); // 3000 + 10% jitter
    });
  });

  // ── Exponential Strategy ────────────────────────────────
  describe('Exponential Strategy', () => {
    const policy: RetryPolicy = {
      strategy: 'exponential',
      max_retries: 5,
      initial_delay: 1000,
      max_delay: 120000,
      backoff_factor: 2.0,
    };

    it('should increase delay exponentially', () => {
      const d0 = calculateRetryDelay(policy, 0); // 1000
      const d1 = calculateRetryDelay(policy, 1); // 2000
      const d2 = calculateRetryDelay(policy, 2); // 4000
      const d3 = calculateRetryDelay(policy, 3); // 8000
      // Each should roughly double (within jitter)
      expect(d1).toBeGreaterThan(1500);
      expect(d2).toBeGreaterThan(3000);
      expect(d3).toBeGreaterThan(6000);
    });

    it('should cap at max_delay', () => {
      const d4 = calculateRetryDelay({ ...policy, max_delay: 5000 }, 4); // 16000, capped to 5000
      expect(d4).toBeLessThanOrEqual(5500);
    });
  });

  // ── shouldRetry ─────────────────────────────────────────
  describe('shouldRetry', () => {
    it('should return true when retries remain', () => {
      expect(shouldRetry(0, 3)).toBe(true);
      expect(shouldRetry(2, 3)).toBe(true);
    });

    it('should return false when retries exhausted', () => {
      expect(shouldRetry(3, 3)).toBe(false);
      expect(shouldRetry(5, 3)).toBe(false);
    });

    it('should return false when max_retries is 0', () => {
      expect(shouldRetry(0, 0)).toBe(false);
    });
  });
});
