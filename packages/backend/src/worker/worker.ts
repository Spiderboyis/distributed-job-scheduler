/**
 * Worker Service — The heart of the distributed job scheduler.
 *
 * Responsibilities:
 * 1. Register itself in the workers table
 * 2. Poll for claimable jobs using SELECT FOR UPDATE SKIP LOCKED
 * 3. Execute jobs with configurable simulated workloads
 * 4. Handle success/failure, retries, and DLQ
 * 5. Send periodic heartbeats
 * 6. Support graceful shutdown
 */
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction, dbEvents } from '../config/database.js';
import { env } from '../config/env.js';
import { calculateRetryDelay, shouldRetry, RetryPolicy } from '../utils/retry.js';
import { executeSimulatedJob } from './job-executor.js';

export class WorkerService {
  private workerId: string | null = null;
  private workerName: string;
  private isRunning = false;
  private isDraining = false;
  private activeJobs = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private pollRequested = false;

  private dbListener = () => {
    if (this.isRunning && !this.isDraining && this.activeJobs < env.WORKER_CONCURRENCY) {
      if (this.isPolling) {
        this.pollRequested = true;
      } else {
        this.poll();
      }
    }
  };

  constructor(name?: string) {
    this.workerName = name || `worker-${os.hostname()}-${process.pid}`;
  }

  async start(queueIds?: string[]): Promise<void> {
    console.log(`[Worker] Starting ${this.workerName}...`);

    // Register worker
    const queues = queueIds || [];
    const result = await query(
      `INSERT INTO workers (name, hostname, pid, status, queues, concurrency)
       VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
      [this.workerName, os.hostname(), process.pid, queues, env.WORKER_CONCURRENCY]
    );
    this.workerId = result.rows[0].id;
    this.isRunning = true;

    console.log(`[Worker] Registered with id=${this.workerId}`);

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), env.WORKER_HEARTBEAT_INTERVAL);

    // Start polling
    this.poll();

    // Listen for instant database notifications
    dbEvents.on('jobs_changed', this.dbListener);

    // Start stale worker detection
    setInterval(() => this.reclaimStaleJobs(), env.WORKER_STALE_THRESHOLD);
  }

  async stop(): Promise<void> {
    console.log(`[Worker] Graceful shutdown initiated...`);
    this.isDraining = true;

    // Update status to draining
    if (this.workerId) {
      await query("UPDATE workers SET status = 'draining' WHERE id = $1", [this.workerId]);
    }

    // Wait for active jobs (max 30s)
    const deadline = Date.now() + 30000;
    while (this.activeJobs > 0 && Date.now() < deadline) {
      console.log(`[Worker] Waiting for ${this.activeJobs} active job(s)...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Cleanup
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    dbEvents.off('jobs_changed', this.dbListener);
    this.isRunning = false;

    if (this.workerId) {
      await query("UPDATE workers SET status = 'inactive' WHERE id = $1", [this.workerId]);
    }
    console.log(`[Worker] Shutdown complete.`);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.isDraining) return;
    if (this.activeJobs >= env.WORKER_CONCURRENCY) return;
    
    if (this.isPolling) {
      this.pollRequested = true;
      return;
    }
    
    this.isPolling = true;
    this.pollRequested = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    try {
      const job = await this.claimJob();
      if (job) {
        this.activeJobs++;
        this.processJob(job).finally(() => {
          this.activeJobs--;
          // Trigger a poll when a job finishes in case more are waiting
          this.poll();
        });
        
        this.isPolling = false;
        // Immediately try to claim another job to fill concurrency slots
        this.poll();
        return;
      }
    } catch (error) {
      console.error('[Worker] Poll error:', error);
    }

    this.isPolling = false;
    
    if (this.pollRequested) {
      this.poll();
    } else {
      // No jobs found. Fallback to a slow 60-second timer for delayed/scheduled jobs.
      // Standard execution relies on instant dbEvents triggers.
      this.pollTimer = setTimeout(() => this.poll(), 60000);
    }
  }

  /**
   * Atomically claim a job using SELECT FOR UPDATE SKIP LOCKED.
   * This is the critical concurrency primitive — guarantees no two workers
   * can claim the same job, even under high contention.
   */
  private async claimJob(): Promise<any | null> {
    const result = await query(
      `WITH next_job AS (
        SELECT j.id FROM jobs j
        JOIN queues q ON q.id = j.queue_id
        WHERE j.status = 'queued'
          AND q.is_paused = false
          AND (j.scheduled_at IS NULL OR j.scheduled_at <= now())
        ORDER BY q.priority DESC, j.priority DESC, j.created_at ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
      )
      UPDATE jobs SET
        status = 'claimed',
        claimed_by = $1,
        started_at = now()
      WHERE id = (SELECT id FROM next_job)
      RETURNING *`,
      [this.workerId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async processJob(job: any): Promise<void> {
    const executionId = uuidv4();
    const attempt = job.retry_count + 1;

    try {
      // Record execution start
      await query(
        `INSERT INTO job_executions (id, job_id, worker_id, attempt, status)
         VALUES ($1, $2, $3, $4, 'running')`,
        [executionId, job.id, this.workerId, attempt]
      );

      // Update job status to running
      await query("UPDATE jobs SET status = 'running' WHERE id = $1", [job.id]);
      await query(
        `INSERT INTO job_logs (job_id, level, message, metadata)
         VALUES ($1, 'info', $2, $3)`,
        [job.id, `Job picked up by worker ${this.workerName}, attempt ${attempt}`, JSON.stringify({ workerId: this.workerId, executionId })]
      );

      // Execute the job (simulated workload)
      const result = await executeSimulatedJob(job);

      // Success
      const durationMs = Date.now() - new Date(job.started_at).getTime();
      await query(
        `UPDATE jobs SET status = 'completed', result = $1, completed_at = now() WHERE id = $2`,
        [JSON.stringify(result), job.id]
      );
      await query(
        `UPDATE job_executions SET status = 'completed', completed_at = now(), duration_ms = $1, result = $2 WHERE id = $3`,
        [durationMs, JSON.stringify(result), executionId]
      );
      await query(
        `INSERT INTO job_logs (job_id, level, message, metadata) VALUES ($1, 'info', $2, $3)`,
        [job.id, `Job completed successfully in ${durationMs}ms`, JSON.stringify({ durationMs, result })]
      );

      console.log(`[Worker] ✓ Job ${job.id} completed (${durationMs}ms)`);

    } catch (error: any) {
      const errMsg = error.message || 'Unknown error';
      const durationMs = Date.now() - new Date(job.started_at).getTime();

      // Record failure
      await query(
        `UPDATE job_executions SET status = 'failed', completed_at = now(), duration_ms = $1, error = $2 WHERE id = $3`,
        [durationMs, errMsg, executionId]
      );

      await query(
        `INSERT INTO job_logs (job_id, level, message, metadata) VALUES ($1, 'error', $2, $3)`,
        [job.id, `Job failed: ${errMsg}`, JSON.stringify({ error: errMsg, attempt, durationMs })]
      );

      // Retry or move to DLQ
      if (shouldRetry(job.retry_count, job.max_retries)) {
        const retryPolicy = await this.getRetryPolicy(job.queue_id);
        const delay = retryPolicy
          ? calculateRetryDelay(retryPolicy, job.retry_count)
          : 5000;

        const scheduledAt = new Date(Date.now() + delay);
        await query(
          `UPDATE jobs SET status = 'queued', retry_count = retry_count + 1,
           scheduled_at = $1, error = $2, claimed_by = NULL, started_at = NULL
           WHERE id = $3`,
          [scheduledAt, errMsg, job.id]
        );

        console.log(`[Worker] ↻ Job ${job.id} scheduled for retry in ${delay}ms (attempt ${attempt}/${job.max_retries})`);
        await query(
          `INSERT INTO job_logs (job_id, level, message) VALUES ($1, 'warn', $2)`,
          [job.id, `Retry ${attempt}/${job.max_retries} scheduled in ${delay}ms`]
        );
      } else {
        // Move to DLQ
        await query(`UPDATE jobs SET status = 'dead', error = $1, completed_at = now() WHERE id = $2`, [errMsg, job.id]);
        await query(
          `INSERT INTO dead_letter_queue (original_job_id, queue_id, payload, error, retry_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [job.id, job.queue_id, job.payload, errMsg, job.retry_count]
        );

        console.log(`[Worker] ✗ Job ${job.id} moved to DLQ after ${job.max_retries} retries`);
        await query(
          `INSERT INTO job_logs (job_id, level, message) VALUES ($1, 'error', $2)`,
          [job.id, `All ${job.max_retries} retries exhausted. Moved to Dead Letter Queue.`]
        );
      }
    }
  }

  private async getRetryPolicy(queueId: string): Promise<RetryPolicy | null> {
    const result = await query(
      `SELECT rp.* FROM retry_policies rp
       JOIN queues q ON q.retry_policy_id = rp.id WHERE q.id = $1`, [queueId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.workerId) return;
    try {
      const cpuUsage = os.loadavg()[0];
      const memUsage = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
      await query("UPDATE workers SET last_heartbeat = now() WHERE id = $1", [this.workerId]);
      await query(
        `INSERT INTO worker_heartbeats (worker_id, active_jobs, cpu_usage, memory_mb)
         VALUES ($1, $2, $3, $4)`, [this.workerId, this.activeJobs, cpuUsage, memUsage]
      );
    } catch (error) {
      console.error('[Worker] Heartbeat error:', error);
    }
  }

  /**
   * Detect workers that haven't sent heartbeats and reclaim their jobs.
   */
  private async reclaimStaleJobs(): Promise<void> {
    try {
      // Mark stale workers
      const staleResult = await query(
        `UPDATE workers SET status = 'inactive'
         WHERE status = 'active' AND last_heartbeat < now() - interval '${env.WORKER_STALE_THRESHOLD / 1000} seconds'
         AND id != $1 RETURNING id`, [this.workerId]
      );

      if (staleResult.rows.length > 0) {
        const staleIds = staleResult.rows.map((r: any) => r.id);
        console.log(`[Worker] Detected ${staleIds.length} stale worker(s): ${staleIds.join(', ')}`);

        // Reclaim jobs from stale workers
        const reclaimedResult = await query(
          `UPDATE jobs SET status = 'queued', claimed_by = NULL, started_at = NULL
           WHERE claimed_by = ANY($1) AND status IN ('claimed', 'running')
           RETURNING id`, [staleIds]
        );

        if (reclaimedResult.rows.length > 0) {
          console.log(`[Worker] Reclaimed ${reclaimedResult.rows.length} job(s) from stale workers`);
        }
      }
    } catch (error) {
      console.error('[Worker] Stale detection error:', error);
    }
  }
}
