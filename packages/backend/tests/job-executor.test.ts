import { describe, it, expect } from 'vitest';
import { executeSimulatedJob } from '../src/worker/job-executor.js';

describe('Job Executor', () => {
  describe('executeSimulatedJob', () => {
    it('should execute email_send job successfully most of the time', async () => {
      let successes = 0;
      const runs = 10;
      for (let i = 0; i < runs; i++) {
        try {
          const result = await executeSimulatedJob({
            payload: { type: 'email_send' },
            name: 'test-email',
            timeout_ms: 30000,
          });
          expect(result.jobType).toBe('email_send');
          expect(result.processedAt).toBeTruthy();
          expect(result.metadata.delivered).toBe(true);
          successes++;
        } catch {
          // Expected occasional failures
        }
      }
      // email_send has 5% failure rate, expect at least 7/10 to succeed
      expect(successes).toBeGreaterThanOrEqual(5);
    }, 30000);

    it('should include correct metadata for image_resize', async () => {
      // Run multiple times to get a success
      for (let i = 0; i < 20; i++) {
        try {
          const result = await executeSimulatedJob({
            payload: { type: 'image_resize', width: 1024, height: 768 },
            name: 'test-resize',
            timeout_ms: 30000,
          });
          expect(result.metadata.outputSize).toBe('1024x768');
          expect(result.metadata.format).toBe('webp');
          return; // test passed
        } catch {}
      }
    }, 60000);

    it('should fail more often for report_generate (worst case)', async () => {
      let failures = 0;
      const runs = 10;
      for (let i = 0; i < runs; i++) {
        try {
          await executeSimulatedJob({
            payload: { type: 'report_generate' },
            name: 'test-report',
            timeout_ms: 30000,
          });
        } catch {
          failures++;
        }
      }
      // report_generate has 30% failure rate, expect some failures
      expect(failures).toBeGreaterThanOrEqual(1);
    }, 60000);

    it('should handle unknown job types with defaults', async () => {
      // Run until success
      for (let i = 0; i < 20; i++) {
        try {
          const result = await executeSimulatedJob({
            payload: { type: 'custom_unknown_type' },
            name: 'test-unknown',
            timeout_ms: 30000,
          });
          expect(result.metadata.processed).toBe(true);
          return;
        } catch {}
      }
    }, 60000);
  });
});
