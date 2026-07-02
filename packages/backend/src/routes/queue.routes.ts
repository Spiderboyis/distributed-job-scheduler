import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validate, paginate } from '../middleware/validate.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

const router = Router();

const createQueueSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  priority: z.number().int().min(0).max(100).default(0),
  concurrency: z.number().int().min(1).max(100).default(5),
  retryPolicyId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  concurrency: z.number().int().min(1).max(100).optional(),
  retryPolicyId: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional(),
  isPaused: z.boolean().optional(),
});

router.post('/projects/:projectId/queues', authenticate, validate(createQueueSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const { name, slug, priority, concurrency, retryPolicyId, description } = req.body;
      const projCheck = await query(
        `SELECT p.id FROM projects p JOIN org_members om ON om.organization_id = p.organization_id AND om.user_id = $2 WHERE p.id = $1`,
        [projectId, req.user!.userId]
      );
      if (projCheck.rows.length === 0) throw new NotFoundError('Project', projectId);
      const result = await query(
        `INSERT INTO queues (project_id, name, slug, priority, concurrency, retry_policy_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [projectId, name, slug, priority, concurrency, retryPolicyId || null, description || null]
      );
      res.status(201).json({ queue: result.rows[0] });
    } catch (error: any) {
      if (error.code === '23505') next(new ConflictError('Queue slug already exists'));
      else next(error);
    }
  }
);

router.get('/projects/:projectId/queues', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      `SELECT q.*, rp.name as retry_policy_name, rp.strategy as retry_strategy, rp.max_retries,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'queued')::int as queued_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'running')::int as running_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'completed')::int as completed_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'failed')::int as failed_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'dead')::int as dead_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id)::int as total_jobs
       FROM queues q LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id
       WHERE q.project_id = $1 ORDER BY q.priority DESC, q.name ASC`,
      [req.params.projectId]
    );
    res.json({ queues: result.rows });
  } catch (error) { next(error); }
});

router.get('/queues/:queueId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      `SELECT q.*, rp.name as retry_policy_name, rp.strategy as retry_strategy, rp.max_retries, rp.initial_delay, rp.max_delay, rp.backoff_factor,
              p.name as project_name,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'queued')::int as queued_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'running')::int as running_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'completed')::int as completed_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'failed')::int as failed_count,
              (SELECT count(*) FROM jobs WHERE queue_id = q.id AND status = 'dead')::int as dead_count,
              (SELECT count(*) FROM dead_letter_queue WHERE queue_id = q.id AND requeued_at IS NULL)::int as dlq_count
       FROM queues q LEFT JOIN retry_policies rp ON rp.id = q.retry_policy_id LEFT JOIN projects p ON p.id = q.project_id
       WHERE q.id = $1`,
      [req.params.queueId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Queue', req.params.queueId);
    res.json({ queue: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch('/queues/:queueId', authenticate, validate(updateQueueSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;
      const map: Record<string, string> = { name: 'name', priority: 'priority', concurrency: 'concurrency', retryPolicyId: 'retry_policy_id', description: 'description', isPaused: 'is_paused' };
      for (const [key, col] of Object.entries(map)) {
        if (req.body[key] !== undefined) { updates.push(`${col} = $${p}`); values.push(req.body[key]); p++; }
      }
      if (updates.length === 0) { res.status(400).json({ error: { message: 'No fields to update' } }); return; }
      values.push(req.params.queueId);
      const result = await query(`UPDATE queues SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`, values);
      if (result.rows.length === 0) throw new NotFoundError('Queue', req.params.queueId);
      res.json({ queue: result.rows[0] });
    } catch (error) { next(error); }
  }
);

router.post('/queues/:queueId/pause', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query('UPDATE queues SET is_paused = true WHERE id = $1 RETURNING id, name, is_paused', [req.params.queueId]);
    if (result.rows.length === 0) throw new NotFoundError('Queue', req.params.queueId);
    res.json({ queue: result.rows[0], message: 'Queue paused' });
  } catch (error) { next(error); }
});

router.post('/queues/:queueId/resume', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query('UPDATE queues SET is_paused = false WHERE id = $1 RETURNING id, name, is_paused', [req.params.queueId]);
    if (result.rows.length === 0) throw new NotFoundError('Queue', req.params.queueId);
    res.json({ queue: result.rows[0], message: 'Queue resumed' });
  } catch (error) { next(error); }
});

router.get('/queues/:queueId/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statsResult = await query(
      `SELECT count(*) FILTER (WHERE status = 'queued')::int as queued, count(*) FILTER (WHERE status = 'running')::int as running,
              count(*) FILTER (WHERE status = 'completed')::int as completed, count(*) FILTER (WHERE status = 'failed')::int as failed,
              count(*) FILTER (WHERE status = 'dead')::int as dead, count(*)::int as total,
              round(avg(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE status = 'completed'))::int as avg_duration_ms,
              round(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE status = 'completed'))::int as p95_duration_ms,
              count(*) FILTER (WHERE status = 'completed' AND created_at > now() - interval '1 hour')::int as completed_last_hour,
              count(*) FILTER (WHERE status = 'failed' AND created_at > now() - interval '1 hour')::int as failed_last_hour
       FROM jobs WHERE queue_id = $1`, [req.params.queueId]
    );
    const throughputResult = await query(
      `SELECT date_trunc('hour', completed_at) as hour, count(*)::int as completed
       FROM jobs WHERE queue_id = $1 AND completed_at > now() - interval '24 hours' AND status = 'completed'
       GROUP BY date_trunc('hour', completed_at) ORDER BY hour`, [req.params.queueId]
    );
    res.json({ stats: statsResult.rows[0], throughput: throughputResult.rows });
  } catch (error) { next(error); }
});

router.get('/retry-policies', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query('SELECT * FROM retry_policies ORDER BY name');
    res.json({ policies: result.rows });
  } catch (error) { next(error); }
});

export default router;
