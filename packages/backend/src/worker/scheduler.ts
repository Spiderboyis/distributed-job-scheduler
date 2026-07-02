/**
 * Cron Scheduler Service
 *
 * Periodically checks the scheduled_jobs table for cron jobs that are due,
 * creates concrete job entries in the jobs table, and updates next_run_at.
 */
import { Cron } from 'croner';
import { query } from '../config/database.js';

export class SchedulerService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  start(pollIntervalMs = 15000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Scheduler] Started, checking every ${pollIntervalMs / 1000}s`);
    this.interval = setInterval(() => this.checkScheduledJobs(), pollIntervalMs);
    // Run immediately on start
    this.checkScheduledJobs();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  private async checkScheduledJobs(): Promise<void> {
    try {
      // Find due cron jobs
      const result = await query(
        `SELECT * FROM scheduled_jobs
         WHERE is_active = true AND next_run_at <= now()
         ORDER BY next_run_at ASC`
      );

      for (const schedule of result.rows) {
        try {
          // Create a concrete job
          await query(
            `INSERT INTO jobs (queue_id, name, type, status, payload)
             VALUES ($1, $2, 'recurring', 'queued', $3)`,
            [schedule.queue_id, schedule.name, schedule.payload]
          );

          // Calculate next run
          const cron = new Cron(schedule.cron_expression, { timezone: schedule.timezone });
          const nextRun = cron.nextRun();

          await query(
            `UPDATE scheduled_jobs SET last_run_at = now(), next_run_at = $1 WHERE id = $2`,
            [nextRun, schedule.id]
          );

          console.log(`[Scheduler] ✓ Enqueued cron job "${schedule.name}", next run: ${nextRun}`);
        } catch (error) {
          console.error(`[Scheduler] Failed to enqueue cron job ${schedule.id}:`, error);
        }
      }

      // Promote delayed/scheduled jobs that are due
      const promoted = await query(
        `UPDATE jobs SET status = 'queued'
         WHERE status = 'scheduled' AND scheduled_at <= now()
         RETURNING id`
      );
      if (promoted.rows.length > 0) {
        console.log(`[Scheduler] Promoted ${promoted.rows.length} scheduled job(s) to queued`);
      }
    } catch (error) {
      console.error('[Scheduler] Check error:', error);
    }
  }
}
