import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { paginate } from '../middleware/validate.js';

const router = Router();

// GET /api/workers — List all workers
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      `SELECT w.*,
              (SELECT count(*)::int FROM jobs WHERE claimed_by = w.id AND status = 'running') as active_jobs,
              (SELECT count(*)::int FROM jobs WHERE claimed_by = w.id AND status = 'completed') as completed_jobs,
              (SELECT count(*)::int FROM jobs WHERE claimed_by = w.id AND status = 'failed') as failed_jobs,
              EXTRACT(EPOCH FROM (now() - w.last_heartbeat))::int as seconds_since_heartbeat
       FROM workers w ORDER BY w.status ASC, w.last_heartbeat DESC`
    );
    res.json({ workers: result.rows });
  } catch (error) { next(error); }
});

// GET /api/workers/:workerId — Worker detail with heartbeat history
router.get('/:workerId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workerResult = await query('SELECT * FROM workers WHERE id = $1', [req.params.workerId]);
    if (workerResult.rows.length === 0) { res.status(404).json({ error: { message: 'Worker not found' } }); return; }

    const heartbeats = await query(
      'SELECT * FROM worker_heartbeats WHERE worker_id = $1 ORDER BY heartbeat_at DESC LIMIT 50',
      [req.params.workerId]
    );
    const recentJobs = await query(
      `SELECT j.id, j.name, j.status, j.started_at, j.completed_at FROM jobs j
       WHERE j.claimed_by = $1 ORDER BY j.updated_at DESC LIMIT 20`, [req.params.workerId]
    );
    res.json({ worker: workerResult.rows[0], heartbeats: heartbeats.rows, recentJobs: recentJobs.rows });
  } catch (error) { next(error); }
});

// GET /api/dlq — Dead Letter Queue
router.get('/dlq/entries', authenticate, paginate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = (req as any).pagination;
    const queueId = req.query.queueId as string;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let p = 1;
    if (queueId) { where += ` AND d.queue_id = $${p}`; params.push(queueId); p++; }

    const countResult = await query(`SELECT count(*)::int as total FROM dead_letter_queue d ${where}`, params);
    params.push(limit, offset);
    const result = await query(
      `SELECT d.*, q.name as queue_name, j.name as job_name, j.type as job_type
       FROM dead_letter_queue d LEFT JOIN queues q ON q.id = d.queue_id LEFT JOIN jobs j ON j.id = d.original_job_id
       ${where} ORDER BY d.failed_at DESC LIMIT $${p} OFFSET $${p + 1}`, params
    );
    res.json({ entries: result.rows, pagination: { page, limit, total: countResult.rows[0].total, totalPages: Math.ceil(countResult.rows[0].total / limit) } });
  } catch (error) { next(error); }
});

// POST /api/dlq/:id/retry — Retry DLQ entry
router.post('/dlq/:id/retry', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dlqResult = await query('SELECT * FROM dead_letter_queue WHERE id = $1 AND requeued_at IS NULL', [req.params.id]);
    if (dlqResult.rows.length === 0) { res.status(404).json({ error: { message: 'DLQ entry not found or already requeued' } }); return; }
    const dlq = dlqResult.rows[0];

    const newJob = await query(
      `INSERT INTO jobs (queue_id, name, type, status, priority, payload, max_retries)
       VALUES ($1, 'DLQ retry', 'immediate', 'queued', 5, $2, 3) RETURNING *`,
      [dlq.queue_id, dlq.payload]
    );
    await query('UPDATE dead_letter_queue SET requeued_at = now(), requeued_job_id = $1 WHERE id = $2', [newJob.rows[0].id, req.params.id]);
    res.status(201).json({ job: newJob.rows[0], message: 'DLQ entry requeued' });
  } catch (error) { next(error); }
});

// GET /api/dashboard/stats — Dashboard overview stats
router.get('/dashboard/stats', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobStats = await query(
      `SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'queued')::int as queued,
              count(*) FILTER (WHERE status = 'running')::int as running,
              count(*) FILTER (WHERE status = 'completed')::int as completed,
              count(*) FILTER (WHERE status = 'failed')::int as failed,
              count(*) FILTER (WHERE status = 'dead')::int as dead,
              count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int as created_last_hour,
              count(*) FILTER (WHERE status = 'completed' AND completed_at > now() - interval '1 hour')::int as completed_last_hour
       FROM jobs`
    );
    const workerStats = await query(
      `SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'active')::int as active,
              count(*) FILTER (WHERE status = 'inactive')::int as inactive
       FROM workers`
    );
    const queueStats = await query(
      `SELECT count(*)::int as total, count(*) FILTER (WHERE is_paused = true)::int as paused FROM queues`
    );
    const dlqCount = await query(`SELECT count(*)::int as total FROM dead_letter_queue WHERE requeued_at IS NULL`);

    res.json({
      jobs: jobStats.rows[0],
      workers: workerStats.rows[0],
      queues: queueStats.rows[0],
      dlq: { pending: dlqCount.rows[0].total },
    });
  } catch (error) { next(error); }
});

export default router;
