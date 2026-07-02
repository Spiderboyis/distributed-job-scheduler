import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('[Migrate] Starting database migration...');

  try {
    // Create migrations tracking table
    await query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if already executed
      const { rows } = await query(
        'SELECT id FROM _migrations WHERE name = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`[Migrate] Skipping ${file} (already executed)`);
        continue;
      }

      // Execute migration
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`[Migrate] Executing ${file}...`);
      await query(sql);

      // Record migration
      await query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [file]
      );
      console.log(`[Migrate] ✓ ${file} completed`);
    }

    console.log('[Migrate] All migrations completed successfully.');
  } catch (error) {
    console.error('[Migrate] Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
