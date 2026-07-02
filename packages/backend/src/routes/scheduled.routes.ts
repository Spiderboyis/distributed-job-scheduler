import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';
import { Cron } from 'croner';

const router = Router();

const createScheduledJobSchema = z.object({
  name: z.string().min(1).max(100),
  cronExpression: z.string().min(1),
  timezone: z.string().default('UTC'),
  payload: z.record(z.any()).default({}),
});

const updateScheduledJobSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cronExpression: z.string().min(1).optional(),
  timezone: z.string().optional(),
  payload: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

// POST /api/queues/:queueId/scheduled — Create cron job definition
router.post('/queues/:queueId/scheduled', authenticate, validate(createScheduledJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, cronExpression, timezone, payload } = req.body;
      // Validate cron expression
      try { new Cron(cronExpression); } catch { throw new Error('Invalid cron expression'); }

      const cron = new Cron(cronExpression, { timezone });
      const nextRun = cron.nextRun();

      const result = await query(
        `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, timezone, payload, next_run_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.queueId, name, cronExpression, timezone, JSON.stringify(payload), nextRun]
      );
      res.status(201).json({ scheduledJob: result.rows[0] });
    } catch (error) { next(error); }
  }
);

// GET /api/queues/:queueId/scheduled — List cron jobs
router.get('/queues/:queueId/scheduled', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query(
      'SELECT * FROM scheduled_jobs WHERE queue_id = $1 ORDER BY created_at DESC', [req.params.queueId]
    );
    res.json({ scheduledJobs: result.rows });
  } catch (error) { next(error); }
});

// PATCH /api/scheduled/:id — Update cron job
router.patch('/scheduled/:id', authenticate, validate(updateScheduledJobSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;
      const map: Record<string, string> = { name: 'name', cronExpression: 'cron_expression', timezone: 'timezone', isActive: 'is_active' };
      for (const [key, col] of Object.entries(map)) {
        if (req.body[key] !== undefined) { updates.push(`${col} = $${p}`); values.push(req.body[key]); p++; }
      }
      if (req.body.payload !== undefined) { updates.push(`payload = $${p}`); values.push(JSON.stringify(req.body.payload)); p++; }
      // Recalculate next_run_at if cron changed
      if (req.body.cronExpression) {
        const cron = new Cron(req.body.cronExpression, { timezone: req.body.timezone || 'UTC' });
        updates.push(`next_run_at = $${p}`); values.push(cron.nextRun()); p++;
      }
      if (updates.length === 0) { res.status(400).json({ error: { message: 'No fields to update' } }); return; }
      values.push(req.params.id);
      const result = await query(`UPDATE scheduled_jobs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`, values);
      if (result.rows.length === 0) throw new NotFoundError('Scheduled job', req.params.id);
      res.json({ scheduledJob: result.rows[0] });
    } catch (error) { next(error); }
  }
);

// DELETE /api/scheduled/:id
router.delete('/scheduled/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query('DELETE FROM scheduled_jobs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) throw new NotFoundError('Scheduled job', req.params.id);
    res.json({ message: 'Scheduled job deleted' });
  } catch (error) { next(error); }
});

export default router;
