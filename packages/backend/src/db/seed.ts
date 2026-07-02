import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool, query } from '../config/database.js';
import crypto from 'crypto';

async function seed() {
  console.log('[Seed] Starting database seeding...');

  try {
    // Create demo user
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('demo123456', 12);
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [userId, 'demo@jobscheduler.dev', passwordHash, 'Demo User']
    );
    console.log('[Seed] ✓ Demo user created (demo@jobscheduler.dev / demo123456)');

    // Create organization
    const orgId = uuidv4();
    await query(
      `INSERT INTO organizations (id, name, slug, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [orgId, 'Demo Organization', 'demo-org', userId]
    );

    // Add user as org owner
    await query(
      `INSERT INTO org_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [orgId, userId, 'owner']
    );
    console.log('[Seed] ✓ Organization created');

    // Create project
    const projectId = uuidv4();
    const apiKey = `jsk_${crypto.randomBytes(24).toString('hex')}`;
    await query(
      `INSERT INTO projects (id, organization_id, name, slug, api_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, slug) DO NOTHING`,
      [projectId, orgId, 'Default Project', 'default-project', apiKey]
    );
    console.log('[Seed] ✓ Project created');

    // Create queues with different retry policies
    const queues = [
      { name: 'Email Queue', slug: 'email-queue', priority: 10, concurrency: 10, retryPolicyId: '00000000-0000-0000-0000-000000000001', desc: 'Email sending tasks' },
      { name: 'Export Queue', slug: 'export-queue', priority: 5, concurrency: 3, retryPolicyId: '00000000-0000-0000-0000-000000000003', desc: 'Data export tasks' },
      { name: 'Image Processing', slug: 'image-processing', priority: 3, concurrency: 5, retryPolicyId: '00000000-0000-0000-0000-000000000002', desc: 'Image resize and conversion' },
      { name: 'Reports', slug: 'reports', priority: 1, concurrency: 2, retryPolicyId: '00000000-0000-0000-0000-000000000003', desc: 'Report generation tasks' },
    ];

    const queueIds: string[] = [];
    for (const q of queues) {
      const queueId = uuidv4();
      queueIds.push(queueId);
      await query(
        `INSERT INTO queues (id, project_id, name, slug, priority, concurrency, retry_policy_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (project_id, slug) DO NOTHING`,
        [queueId, projectId, q.name, q.slug, q.priority, q.concurrency, q.retryPolicyId, q.desc]
      );
    }
    console.log('[Seed] ✓ 4 queues created');

    // Create sample jobs in various states
    const statuses = ['queued', 'running', 'completed', 'failed'];
    const jobTypes = ['immediate', 'delayed', 'scheduled', 'recurring', 'batch'];

    const samplePayloads = [
      { type: 'email_send', to: 'user@example.com', subject: 'Welcome', template: 'welcome' },
      { type: 'data_export', format: 'csv', filters: { date_range: '30d' }, size_estimate: '50MB' },
      { type: 'image_resize', source_url: 'https://example.com/photo.jpg', width: 800, height: 600 },
      { type: 'report_generate', report_type: 'monthly_analytics', date: '2026-06-01' },
    ];

    let jobCount = 0;
    for (let i = 0; i < queueIds.length; i++) {
      for (let j = 0; j < 8; j++) {
        const status = statuses[j % statuses.length];
        const type = jobTypes[j % jobTypes.length];
        const payload = samplePayloads[i % samplePayloads.length];
        const now = new Date();
        const createdAt = new Date(now.getTime() - Math.random() * 86400000 * 3);

        await query(
          `INSERT INTO jobs (queue_id, type, name, status, priority, payload, scheduled_at, started_at, completed_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            queueIds[i],
            type,
            `${payload.type}_${j + 1}`,
            status,
            Math.floor(Math.random() * 10),
            JSON.stringify(payload),
            type === 'delayed' ? new Date(now.getTime() + 60000) : null,
            status !== 'queued' ? new Date(createdAt.getTime() + 1000) : null,
            status === 'completed' ? new Date(createdAt.getTime() + 5000 + Math.random() * 10000) : null,
            createdAt,
          ]
        );
        jobCount++;
      }
    }
    console.log(`[Seed] ✓ ${jobCount} sample jobs created`);

    // Create a scheduled (cron) job
    await query(
      `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, timezone, payload, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        queueIds[0],
        'Hourly Email Digest',
        '0 * * * *',
        'UTC',
        JSON.stringify({ type: 'email_send', template: 'digest', batch: true }),
        new Date(Date.now() + 3600000),
      ]
    );

    await query(
      `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, timezone, payload, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        queueIds[3],
        'Daily Report',
        '0 9 * * *',
        'UTC',
        JSON.stringify({ type: 'report_generate', report_type: 'daily_summary' }),
        new Date(Date.now() + 86400000),
      ]
    );
    console.log('[Seed] ✓ Scheduled cron jobs created');

    console.log('[Seed] Seeding completed successfully!');
    console.log('[Seed] Login: demo@jobscheduler.dev / demo123456');
  } catch (error) {
    console.error('[Seed] Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
