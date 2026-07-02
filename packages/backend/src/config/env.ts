import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/jobscheduler',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Worker
  WORKER_POLL_INTERVAL: parseInt(process.env.WORKER_POLL_INTERVAL || '2000', 10),
  WORKER_HEARTBEAT_INTERVAL: parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '30000', 10),
  WORKER_STALE_THRESHOLD: parseInt(process.env.WORKER_STALE_THRESHOLD || '120000', 10),
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),

  // Frontend URL (CORS)
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
} as const;
