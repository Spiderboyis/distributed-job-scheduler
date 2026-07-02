/**
 * Retry Strategy Calculator
 *
 * Computes the delay before the next retry attempt based on the configured strategy.
 * Supports three strategies:
 *   - fixed:       delay = initial_delay (constant)
 *   - linear:      delay = initial_delay + (attempt * initial_delay)
 *   - exponential: delay = min(initial_delay * factor^attempt, max_delay)
 */

export interface RetryPolicy {
  strategy: 'fixed' | 'linear' | 'exponential';
  max_retries: number;
  initial_delay: number;   // milliseconds
  max_delay: number;       // milliseconds
  backoff_factor: number;
}

/**
 * Calculate the delay in milliseconds before the next retry attempt.
 *
 * @param policy - The retry policy configuration
 * @param attempt - Current attempt number (0-indexed, so first retry = attempt 1)
 * @returns Delay in milliseconds, or -1 if retries are exhausted
 */
export function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  if (attempt >= policy.max_retries) {
    return -1; // Exhausted — move to DLQ
  }

  let delay: number;

  switch (policy.strategy) {
    case 'fixed':
      // Constant delay regardless of attempt number
      delay = policy.initial_delay;
      break;

    case 'linear':
      // Linearly increasing: 2s, 4s, 6s, 8s...
      delay = policy.initial_delay + (attempt * policy.initial_delay);
      break;

    case 'exponential':
      // Exponentially increasing: 1s, 2s, 4s, 8s, 16s...
      delay = policy.initial_delay * Math.pow(policy.backoff_factor, attempt);
      break;

    default:
      delay = policy.initial_delay;
  }

  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  delay = Math.round(delay + jitter);

  // Cap at max_delay
  return Math.min(delay, policy.max_delay);
}

/**
 * Check if a job should be retried or moved to DLQ.
 */
export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}
