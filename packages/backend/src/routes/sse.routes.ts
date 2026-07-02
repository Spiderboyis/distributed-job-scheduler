/**
 * Server-Sent Events (SSE) endpoint for live dashboard updates.
 * Pushes job stats, worker status, and queue health every 3 seconds.
 */
import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';

const router = Router();

router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendUpdate = async () => {
    try {
      const jobStats = await query(
        `SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'queued')::int as queued,
                count(*) FILTER (WHERE status = 'running')::int as running,
                count(*) FILTER (WHERE status = 'completed')::int as completed,
                count(*) FILTER (WHERE status = 'failed')::int as failed,
                count(*) FILTER (WHERE status = 'dead')::int as dead FROM jobs`
      );
      const workerStats = await query(
        `SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'active')::int as active FROM workers`
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

  // Send initial data
  sendUpdate();
  const interval = setInterval(sendUpdate, 3000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
