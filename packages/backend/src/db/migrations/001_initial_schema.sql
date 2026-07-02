-- ============================================================
-- Distributed Job Scheduler - Database Schema
-- Version: 1.0.0
-- Engine: PostgreSQL 16+
-- ============================================================
-- Design Principles:
--   1. UUID primary keys for distributed-friendly identifiers
--   2. TIMESTAMPTZ for all time columns (timezone-aware)
--   3. CHECK constraints for enum-like columns (type safety)
--   4. Partial indexes for hot query paths (performance)
--   5. CASCADE deletes for ownership hierarchies
--   6. JSONB for flexible payloads (schema-on-read)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
-- Stores authenticated platform users.
-- PK: id (UUID) — globally unique, no sequential guessing.
-- Index: email (UNIQUE) — fast login lookups.
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ORGANIZATIONS
-- ============================================================
-- Multi-tenant container. Users belong to orgs, orgs own projects.
-- PK: id (UUID).
-- Index: slug (UNIQUE) — URL-friendly org identifier.
-- FK: created_by → users(id) — tracks org creator.
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ORG_MEMBERS (junction table)
-- ============================================================
-- Maps users ↔ organizations with role-based access.
-- PK: id (UUID).
-- UNIQUE(org_id, user_id) — prevents duplicate membership.
-- CASCADE: removing an org or user cleans up memberships.
-- CHECK: role must be one of owner/admin/member.
CREATE TABLE org_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

-- ============================================================
-- 4. PROJECTS
-- ============================================================
-- Each project scopes a set of queues. Belongs to one org.
-- PK: id (UUID).
-- UNIQUE(org_id, slug) — unique project names per org.
-- UNIQUE(api_key) — for programmatic access.
-- CASCADE: deleting an org removes all its projects.
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    api_key         VARCHAR(64) UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, slug)
);

-- ============================================================
-- 5. RETRY POLICIES
-- ============================================================
-- Configurable retry strategies per queue.
-- Strategies: fixed (constant delay), linear (delay grows linearly),
--   exponential (delay doubles with backoff_factor).
-- Performance: max_delay caps runaway backoff; initial_delay in ms.
CREATE TABLE retry_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    strategy        VARCHAR(20) NOT NULL
                    CHECK (strategy IN ('fixed', 'linear', 'exponential')),
    max_retries     INT NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    initial_delay   INT NOT NULL DEFAULT 1000 CHECK (initial_delay >= 0),
    max_delay       INT NOT NULL DEFAULT 60000 CHECK (max_delay >= 0),
    backoff_factor  DECIMAL(5,2) NOT NULL DEFAULT 2.0 CHECK (backoff_factor > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default retry policies
INSERT INTO retry_policies (id, name, strategy, max_retries, initial_delay, max_delay, backoff_factor) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default Fixed', 'fixed', 3, 5000, 5000, 1.0),
    ('00000000-0000-0000-0000-000000000002', 'Default Linear', 'linear', 5, 2000, 60000, 1.0),
    ('00000000-0000-0000-0000-000000000003', 'Default Exponential', 'exponential', 5, 1000, 120000, 2.0);

-- ============================================================
-- 6. QUEUES
-- ============================================================
-- Job queues within a project. Each queue has its own priority,
-- concurrency limit, and retry policy.
-- PK: id (UUID).
-- UNIQUE(project_id, slug) — unique queue names per project.
-- FK: retry_policy_id → retry_policies(id) — optional, SET NULL on delete.
-- is_paused: when true, workers skip this queue entirely.
-- Index on project_id for listing queries.
CREATE TABLE queues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    priority        INT NOT NULL DEFAULT 0,
    concurrency     INT NOT NULL DEFAULT 5 CHECK (concurrency > 0),
    is_paused       BOOLEAN NOT NULL DEFAULT false,
    retry_policy_id UUID REFERENCES retry_policies(id) ON DELETE SET NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, slug)
);
CREATE INDEX idx_queues_project ON queues(project_id);

-- ============================================================
-- 7. WORKERS
-- ============================================================
-- Registered worker instances that poll and execute jobs.
-- PK: id (UUID).
-- Status lifecycle: active → draining → inactive.
-- queues: UUID array of queue IDs this worker listens to.
-- last_heartbeat: used by stale detection (reclaim jobs from dead workers).
CREATE TABLE workers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    hostname        VARCHAR(255),
    pid             INT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'draining', 'inactive')),
    queues          UUID[] NOT NULL DEFAULT '{}',
    concurrency     INT NOT NULL DEFAULT 5 CHECK (concurrency > 0),
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_heartbeat ON workers(last_heartbeat)
    WHERE status = 'active';

-- ============================================================
-- 8. JOBS — Core table
-- ============================================================
-- The heart of the system. Every job lives here.
-- Status lifecycle: queued → scheduled → claimed → running → completed|failed|dead
-- Type: immediate, delayed, scheduled, recurring, batch
-- Partial index on claimable jobs for O(1) polling performance.
-- Idempotency key prevents duplicate job creation.
-- batch_id groups batch jobs for aggregate tracking.
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL DEFAULT 'immediate'
                    CHECK (type IN ('immediate', 'delayed', 'scheduled', 'recurring', 'batch')),
    name            VARCHAR(100) NOT NULL DEFAULT 'untitled',
    status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead')),
    priority        INT NOT NULL DEFAULT 0,
    payload         JSONB NOT NULL DEFAULT '{}',
    result          JSONB,
    error           TEXT,
    max_retries     INT NOT NULL DEFAULT 3,
    retry_count     INT NOT NULL DEFAULT 0,
    scheduled_at    TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    claimed_by      UUID REFERENCES workers(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255),
    batch_id        UUID,
    timeout_ms      INT DEFAULT 30000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Critical: partial index for fast job claiming
-- Only indexes queued jobs that are due for execution
CREATE INDEX idx_jobs_claimable ON jobs(queue_id, priority DESC, created_at ASC)
    WHERE status = 'queued';

-- For filtering by status
CREATE INDEX idx_jobs_status ON jobs(status);

-- For batch job queries
CREATE INDEX idx_jobs_batch ON jobs(batch_id) WHERE batch_id IS NOT NULL;

-- Idempotency enforcement
CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(queue_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- For scheduled job queries
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at)
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- For queue-level stats
CREATE INDEX idx_jobs_queue_status ON jobs(queue_id, status);

-- ============================================================
-- 9. JOB EXECUTIONS
-- ============================================================
-- Full execution history. Each retry creates a new row.
-- Links job → worker for debugging which worker ran what.
-- duration_ms for performance metrics.
CREATE TABLE job_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id       UUID REFERENCES workers(id) ON DELETE SET NULL,
    attempt         INT NOT NULL,
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('running', 'completed', 'failed')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INT,
    error           TEXT,
    result          JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_executions_job ON job_executions(job_id);
CREATE INDEX idx_executions_worker ON job_executions(worker_id);

-- ============================================================
-- 10. JOB LOGS
-- ============================================================
-- Structured logging per job. Levels: info, warn, error, debug.
-- metadata JSONB for arbitrary context (stack traces, etc).
CREATE TABLE job_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level           VARCHAR(10) NOT NULL DEFAULT 'info'
                    CHECK (level IN ('info', 'warn', 'error', 'debug')),
    message         TEXT NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_job ON job_logs(job_id);
CREATE INDEX idx_logs_level ON job_logs(job_id, level);

-- ============================================================
-- 11. SCHEDULED JOBS (Cron Definitions)
-- ============================================================
-- Recurring job definitions. The scheduler loop reads these,
-- creates concrete job rows when next_run_at arrives.
-- timezone: supports user-local scheduling.
-- next_run_at: precomputed for efficient polling.
CREATE TABLE scheduled_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL DEFAULT 'cron-job',
    cron_expression VARCHAR(100) NOT NULL,
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    payload         JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scheduled_due ON scheduled_jobs(next_run_at)
    WHERE is_active = true;

-- ============================================================
-- 12. DEAD LETTER QUEUE
-- ============================================================
-- Jobs that exhausted all retries land here.
-- Preserved for debugging and manual retry.
-- requeued_at + requeued_job_id track manual retry.
CREATE TABLE dead_letter_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    payload         JSONB NOT NULL,
    error           TEXT,
    retry_count     INT NOT NULL DEFAULT 0,
    failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    requeued_at     TIMESTAMPTZ,
    requeued_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL
);
CREATE INDEX idx_dlq_queue ON dead_letter_queue(queue_id);
CREATE INDEX idx_dlq_unrequeued ON dead_letter_queue(queue_id)
    WHERE requeued_at IS NULL;

-- ============================================================
-- 13. WORKER HEARTBEATS
-- ============================================================
-- Time-series of worker health signals.
-- Used for monitoring and stale worker detection.
CREATE TABLE worker_heartbeats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id       UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    active_jobs     INT NOT NULL DEFAULT 0,
    cpu_usage       DECIMAL(5,2),
    memory_mb       INT,
    heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_heartbeats_worker ON worker_heartbeats(worker_id, heartbeat_at DESC);

-- ============================================================
-- Helper function: update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update triggers
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_queues_updated_at BEFORE UPDATE ON queues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_scheduled_jobs_updated_at BEFORE UPDATE ON scheduled_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
