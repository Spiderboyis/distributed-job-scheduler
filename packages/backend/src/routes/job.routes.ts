import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validate, paginate } from '../middleware/validate.js';
import { NotFoundError, ConflictError, ValidationError, UnauthorizedError } from '../utils/errors.js';

const router = Router();

const createJobSchema = z.object({
  name: z.string().min(1).max(255).default('untitled'),
  type: z.enum(['immediate', 'delayed', 'scheduled', 'recurring', 'batch']).default('immediate'),
  payload: z.any().default({}),
  priority: z.number().int().min(0).max(1000000).default(0),
  scheduledAt: z.string().datetime().optional(),
  idempotencyKey: z.string().max(255).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(30000),
  maxRetries: z.number().int().min(0).max(20).optional(),
});

const batchJobSchema = z.object({
  jobs: z.array(createJobSchema).min(1).max(100),
});

// POST /api/queues/:queueId/jobs — Create a job
router.post('/queues/:queueId/jobs', authenticate, validate(createJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { queueId } = req.params;
      const { name, type, payload, priority, scheduledAt, idempotencyKey, timeoutMs, maxRetries } = req.body;

      // Authorization check
      const authResult = await query(
        `SELECT q.id FROM queues q
         JOIN projects p ON p.id = q.project_id
         JOIN org_members om ON om.organization_id = p.organization_id
         WHERE q.id = $1 AND om.user_id = $2`, [queueId, req.user?.userId]
      );
      if (authResult.rows.length === 0) throw new UnauthorizedError('Not authorized to access this queue');

      // Verify queue exists and get retry policy
      const queueResult = await query(
        `SELECT q.*, rp.max_retries as policy_max_retries FROM queues q
         LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id WHERE q.id = $1`, [queueId]
      );
      if (queueResult.rows.length === 0) throw new NotFoundError('Queue', queueId);
      const queue = queueResult.rows[0];
      if (queue.is_paused) throw new ValidationError('Queue is paused, cannot add jobs');

      const effectiveMaxRetries = maxRetries ?? queue.policy_max_retries ?? 3;
      const status = (type === 'delayed' || type === 'scheduled') && scheduledAt ? 'scheduled' : 'queued';
      const parsedSchedule = scheduledAt ? new Date(scheduledAt) : null;

      const result = await query(
        `INSERT INTO jobs (queue_id, name, type, status, priority, payload, scheduled_at, idempotency_key, timeout_ms, max_retries)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [queueId, name, type, status, priority, JSON.stringify(payload), parsedSchedule, idempotencyKey || null, timeoutMs, effectiveMaxRetries]
      );

      // Log job creation
      await query(
        `INSERT INTO job_logs (job_id, level, message, metadata) VALUES ($1, 'info', $2, $3)`,
        [result.rows[0].id, `Job created with type=${type}, status=${status}`, JSON.stringify({ priority, maxRetries: effectiveMaxRetries })]
      );

      res.status(201).json({ job: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505' && error.constraint?.includes('idempotency')) {
        // Return existing job for idempotent requests
        const existing = await query(
          'SELECT * FROM jobs WHERE queue_id = $1 AND idempotency_key = $2',
          [req.params.queueId, req.body.idempotencyKey]
        );
        res.status(200).json({ job: existing.rows[0], idempotent: true });
      } else { next(error); }
    }
  }
);

// POST /api/queues/:queueId/jobs/batch — Create batch jobs
router.post('/queues/:queueId/jobs/batch', authenticate, validate(batchJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { queueId } = req.params;
      const batchId = uuidv4();
      const jobs = req.body.jobs;

      // Authorization check
      const authResult = await query(
        `SELECT q.id FROM queues q
         JOIN projects p ON p.id = q.project_id
         JOIN org_members om ON om.organization_id = p.organization_id
         WHERE q.id = $1 AND om.user_id = $2`, [queueId, req.user?.userId]
      );
      if (authResult.rows.length === 0) throw new UnauthorizedError('Not authorized to access this queue');

      const created = await transaction(async (client) => {
        const results = [];
        for (const job of jobs) {
          const r = await client.query(
            `INSERT INTO jobs (queue_id, name, type, status, priority, payload, batch_id, timeout_ms, max_retries)
             VALUES ($1,$2,'batch','queued',$3,$4,$5,$6,$7) RETURNING *`,
            [queueId, job.name || 'batch-job', job.priority || 0, JSON.stringify(job.payload || {}), batchId, job.timeoutMs || 30000, job.maxRetries || 3]
          );
          results.push(r.rows[0]);
        }
        return results;
      });

      res.status(201).json({ batchId, jobs: created, count: created.length });
    } catch (error) { next(error); }
  }
);

// GET /api/queues/:queueId/jobs — List jobs with pagination & filtering
router.get('/queues/:queueId/jobs', authenticate, paginate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueId } = req.params;
    const { page, limit, offset } = (req as any).pagination;
    const { status, type, search } = req.query;

    // Authorization check
    const authResult = await query(
      `SELECT q.id FROM queues q
       JOIN projects p ON p.id = q.project_id
       JOIN org_members om ON om.organization_id = p.organization_id
       WHERE q.id = $1 AND om.user_id = $2`, [queueId, req.user?.userId]
    );
    if (authResult.rows.length === 0) throw new UnauthorizedError('Not authorized to access this queue');

    let where = 'WHERE j.queue_id = $1';
    const params: any[] = [queueId];
    let paramIdx = 2;

    if (status) { where += ` AND j.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (type) { where += ` AND j.type = $${paramIdx}`; params.push(type); paramIdx++; }
    if (search) { where += ` AND (j.name ILIKE $${paramIdx} OR j.id::text ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }

    const countResult = await query(`SELECT count(*)::int as total FROM jobs j ${where}`, params);
    const total = countResult.rows[0].total;

    params.push(limit, offset);
    const result = await query(
      `SELECT j.*, w.name as worker_name FROM jobs j LEFT JOIN workers w ON w.id = j.claimed_by
       ${where} ORDER BY j.priority DESC, j.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`, params
    );

    res.json({
      jobs: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) { next(error); }
});

// GET /api/jobs/:jobId — Job detail with executions and logs
router.get('/jobs/:jobId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Authorization check
    const authResult = await query(
      `SELECT j.id FROM jobs j
       JOIN queues q ON q.id = j.queue_id
       JOIN projects p ON p.id = q.project_id
       JOIN org_members om ON om.organization_id = p.organization_id
       WHERE j.id = $1 AND om.user_id = $2`, [req.params.jobId, req.user?.userId]
    );
    if (authResult.rows.length === 0) throw new UnauthorizedError('Not authorized to access this job');

    const jobResult = await query(
      `SELECT j.*, q.name as queue_name, q.slug as queue_slug, w.name as worker_name
       FROM jobs j LEFT JOIN queues q ON q.id = j.queue_id LEFT JOIN workers w ON w.id = j.claimed_by
       WHERE j.id = $1`, [req.params.jobId]
    );
    if (jobResult.rows.length === 0) throw new NotFoundError('Job', req.params.jobId);

    const executions = await query(
      `SELECT je.*, w.name as worker_name FROM job_executions je
       LEFT JOIN workers w ON w.id = je.worker_id
       WHERE je.job_id = $1 ORDER BY je.attempt ASC`, [req.params.jobId]
    );

    const logs = await query(
      'SELECT * FROM job_logs WHERE job_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.jobId]
    );

    res.json({ job: jobResult.rows[0], executions: executions.rows, logs: logs.rows });
  } catch (error) { next(error); }
});

// POST /api/jobs/:jobId/retry — Manual retry
router.post('/jobs/:jobId/retry', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Authorization check
    const authResult = await query(
      `SELECT j.id FROM jobs j
       JOIN queues q ON q.id = j.queue_id
       JOIN projects p ON p.id = q.project_id
       JOIN org_members om ON om.organization_id = p.organization_id
       WHERE j.id = $1 AND om.user_id = $2`, [req.params.jobId, req.user?.userId]
    );
    if (authResult.rows.length === 0) throw new UnauthorizedError('Not authorized to access this job');

    const jobResult = await query('SELECT * FROM jobs WHERE id = $1', [req.params.jobId]);
    if (jobResult.rows.length === 0) throw new NotFoundError('Job', req.params.jobId);
    const job = jobResult.rows[0];

    if (!['failed', 'dead'].includes(job.status)) {
      throw new ValidationError(`Cannot retry job with status '${job.status}'`);
    }

    // Create new job as a retry
    const newJob = await query(
      `INSERT INTO jobs (queue_id, name, type, status, priority, payload, max_retries, timeout_ms)
       VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7) RETURNING *`,
      [job.queue_id, job.name + ' (retry)', job.type, job.priority, job.payload, job.max_retries, job.timeout_ms]
    );

    // If from DLQ, mark as requeued
    await query(
      'UPDATE dead_letter_queue SET requeued_at = now(), requeued_job_id = $1 WHERE original_job_id = $2 AND requeued_at IS NULL',
      [newJob.rows[0].id, req.params.jobId]
    );

    await query(
      `INSERT INTO job_logs (job_id, level, message) VALUES ($1, 'info', 'Manual retry triggered, new job created')`,
      [req.params.jobId]
    );

    res.status(201).json({ job: newJob.rows[0], message: 'Job requeued for retry' });
  } catch (error) { next(error); }
});

// DELETE /api/jobs/:jobId — Cancel a job
router.delete('/jobs/:jobId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      `DELETE FROM jobs WHERE id = $1 AND status IN ('queued', 'scheduled') RETURNING id`,
      [req.params.jobId]
    );
    if (result.rows.length === 0) throw new ValidationError('Can only cancel queued or scheduled jobs');
    res.json({ message: 'Job cancelled' });
  } catch (error) { next(error); }
});

export default router;
