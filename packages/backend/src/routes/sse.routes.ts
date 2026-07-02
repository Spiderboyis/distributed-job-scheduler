/**
 * Server-Sent Events (SSE) endpoint for live dashboard updates.
 * Pushes job stats, worker status, and queue health every 3 seconds.
 */
import { Router, Request, Response } from 'express';
import { query, dbEvents } from '../config/database.js';
import { verifyAccessToken } from '../utils/jwt.js';

const router = Router();

router.get('/events', (req: Request, res: Response) => {
  const token = req.query.token as string;
  let userId: string;
  try {
    if (!token) throw new Error();
    const payload = verifyAccessToken(token);
    userId = payload.userId;
  } catch {
    res.status(401).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendUpdate = async () => {
    try {
      const jobStats = await query(
        `SELECT count(*)::int as total, count(*) FILTER (WHERE j.status = 'queued')::int as queued,
                count(*) FILTER (WHERE j.status = 'running')::int as running,
                count(*) FILTER (WHERE j.status = 'completed')::int as completed,
                count(*) FILTER (WHERE j.status = 'failed')::int as failed,
                count(*) FILTER (WHERE j.status = 'dead')::int as dead 
         FROM jobs j
         JOIN queues q ON q.id = j.queue_id
         JOIN projects p ON p.id = q.project_id
         JOIN org_members om ON om.organization_id = p.organization_id
         WHERE om.user_id = $1`, [userId]
      );
      const workerStats = await query(
        `SELECT count(*)::int as total, count(*) FILTER (WHERE w.status = 'active')::int as active 
         FROM workers w
         WHERE EXISTS (
           SELECT 1 FROM jobs j
           JOIN queues q ON q.id = j.queue_id
           JOIN projects p ON p.id = q.project_id
           JOIN org_members om ON om.organization_id = p.organization_id
           WHERE j.claimed_by = w.id AND om.user_id = $1
         )`, [userId]
      );

      const data = JSON.stringify({
        jobs: jobStats.rows[0],
        workers: workerStats.rows[0],
        timestamp: new Date().toISOString(),
      });

      res.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('[SSE] Error:', error);
    }
  };

  // Send initial data immediately
  sendUpdate();
  
  // Use a debouncer to prevent flooding clients with updates if 100 jobs finish at once
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const triggerUpdate = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      sendUpdate();
      debounceTimer = null;
    }, 500);
  };

  dbEvents.on('jobs_changed', triggerUpdate);
  dbEvents.on('workers_changed', triggerUpdate);

  req.on('close', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    dbEvents.off('jobs_changed', triggerUpdate);
    dbEvents.off('workers_changed', triggerUpdate);
  });
});

export default router;
