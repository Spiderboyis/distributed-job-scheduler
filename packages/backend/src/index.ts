import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { checkDatabaseHealth } from './config/database.js';
import { requestId, errorHandler, notFoundHandler } from './middleware/error.js';
import { WorkerService } from './worker/worker.js';
import { SchedulerService } from './worker/scheduler.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/org.routes.js';
import projectRoutes from './routes/project.routes.js';
import queueRoutes from './routes/queue.routes.js';
import jobRoutes from './routes/job.routes.js';
import scheduledRoutes from './routes/scheduled.routes.js';
import workerRoutes from './routes/worker.routes.js';
import sseRoutes from './routes/sse.routes.js';

const app = express();

// ── Global Middleware ───────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('short'));
app.use(requestId);

// ── Health Check ────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', queueRoutes);      // /api/projects/:id/queues + /api/queues/:id
app.use('/api', jobRoutes);         // /api/queues/:id/jobs + /api/jobs/:id
app.use('/api', scheduledRoutes);   // /api/queues/:id/scheduled + /api/scheduled/:id
app.use('/api', workerRoutes);      // /api/workers + /api/dlq + /api/dashboard/stats
app.use('/api/sse', sseRoutes);

// ── Error Handling ──────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  console.log(`\n🚀 Job Scheduler API running on http://localhost:${env.PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${env.PORT}/api/health\n`);
});

// ── Start Worker & Scheduler ────────────────────────────────
const worker = new WorkerService();
const scheduler = new SchedulerService();

(async () => {
  try {
    const dbHealthy = await checkDatabaseHealth();
    if (dbHealthy) {
      await worker.start();
      scheduler.start();
      console.log('⚡ Worker and Scheduler started');
    } else {
      console.warn('⚠️  Database not available, worker/scheduler not started');
    }
  } catch (error) {
    console.error('Failed to start worker:', error);
  }
})();

// ── Graceful Shutdown ───────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  scheduler.stop();
  await worker.stop();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 30s
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
