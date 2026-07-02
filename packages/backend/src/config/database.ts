import pg from 'pg';
import { EventEmitter } from 'events';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Log pool errors
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export const dbEvents = new EventEmitter();

let listenClient: pg.Client | null = null;

export async function setupDatabaseListeners() {
  if (listenClient) return;
  listenClient = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await listenClient.connect();
    console.log('[DB] Dedicated LISTEN client connected');

    listenClient.on('notification', (msg) => {
      if (msg.channel) {
        dbEvents.emit(msg.channel, msg.payload);
      }
    });

    await listenClient.query('LISTEN jobs_changed');
    await listenClient.query('LISTEN workers_changed');
    
    listenClient.on('error', (err) => {
      console.error('[DB] LISTEN client error:', err);
      // Auto-reconnect logic could go here in production
      listenClient = null;
      setTimeout(setupDatabaseListeners, 5000);
    });
  } catch (error) {
    console.error('[DB] Failed to setup LISTEN client:', error);
  }
}

/**
 * Execute a single query
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (env.NODE_ENV === 'development' && duration > 500) {
    console.log(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check for the database connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
