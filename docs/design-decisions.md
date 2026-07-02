# Design Decisions

## 1. PostgreSQL-Native Queuing vs Redis/BullMQ

**Decision**: Use PostgreSQL as both the application database and the job queue engine.

**Alternatives Considered**:
- BullMQ + Redis: Industry standard, highest throughput
- pg-boss: PostgreSQL-based, simpler API
- RabbitMQ: Enterprise message broker

**Rationale**:
- **Single infrastructure dependency**: Eliminates the need for a Redis instance, reducing operational complexity and cost.
- **ACID compliance**: Job state transitions are fully transactional. If a worker crashes mid-claim, the transaction rolls back automatically, and the job returns to the `queued` state.
- **Strong consistency**: No eventual-consistency edge cases. When you query a job's status, you see the truth.
- **Cost**: Zero additional infrastructure cost. Neon's free tier provides a production-grade PostgreSQL instance.
- **Demonstrates database expertise**: The `SELECT FOR UPDATE SKIP LOCKED` pattern is a sophisticated database technique that directly showcases knowledge of row-level locking, transaction isolation, and concurrent data access.

**Trade-offs**:
- PostgreSQL queues have lower throughput than Redis (~10K jobs/sec vs ~100K jobs/sec). This is acceptable for all but the largest systems.
- No built-in pub/sub (unlike Redis). We compensate with SSE for live updates.

---

## 2. Atomic Job Claiming with `SELECT FOR UPDATE SKIP LOCKED`

**Decision**: Use a CTE-based atomic claim query.

```sql
WITH next_job AS (
    SELECT id FROM jobs
    WHERE status = 'queued'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE jobs SET status = 'claimed', claimed_by = $1
WHERE id = (SELECT id FROM next_job)
RETURNING *;
```

**Why SKIP LOCKED**:
- `FOR UPDATE` alone would cause workers to block on each other, serializing all job claims.
- `SKIP LOCKED` tells PostgreSQL to ignore rows locked by other transactions, allowing true parallelism.
- Combined with a CTE `UPDATE`, the claim is a single atomic operation — no race conditions.

**Alternative**: Application-level optimistic locking (UPDATE WHERE version = X). Rejected because it requires retry loops and is less efficient under high contention.

---

## 3. Retry Strategy Design

**Decision**: Support three configurable strategies with jitter.

| Strategy | Formula | Use Case |
|----------|---------|----------|
| Fixed | `delay = initial_delay` | Consistent retry intervals |
| Linear | `delay = initial + (attempt × initial)` | Gradually increasing backoff |
| Exponential | `delay = initial × factor^attempt` | Aggressive backoff for external services |

**Jitter**: All strategies add ±10% random jitter to prevent the thundering herd problem (all workers retrying simultaneously after an outage).

**Trade-off**: Adding jitter makes retry timing less predictable but significantly improves system stability under failure conditions.

---

## 4. SSE vs WebSockets for Live Updates

**Decision**: Use Server-Sent Events (SSE) instead of WebSockets.

**Rationale**:
- Dashboard updates are one-directional (server → client). SSE is designed exactly for this.
- SSE auto-reconnects on disconnection — no reconnection logic needed.
- Works over standard HTTP — no WebSocket upgrade required. Simpler proxy/CDN configuration.
- Lower implementation complexity (one endpoint vs connection management).

**Trade-off**: If we needed bidirectional real-time communication (e.g., interactive terminal), WebSockets would be necessary. For a monitoring dashboard, SSE is sufficient and simpler.

---

## 5. Worker Heartbeat + Stale Detection

**Decision**: Workers send heartbeats every 30 seconds. Jobs from workers that haven't heartbeated in 2 minutes are reclaimed.

**Why**:
- Workers can crash, lose network, or OOM. Without heartbeats, their jobs would be stuck in `running` forever.
- A 2-minute threshold provides a balance: short enough to reclaim quickly, long enough to tolerate brief network blips.

**Mechanism**:
1. Worker writes to `workers.last_heartbeat` and inserts into `worker_heartbeats` (time-series).
2. A background loop checks for workers with `last_heartbeat < now() - threshold`.
3. Stale workers are marked `inactive`, their jobs reset to `queued`.

---

## 6. Simulated Job Execution

**Decision**: Workers execute simulated workloads with configurable failure rates and durations.

**Job Types and Parameters**:
| Job Type | Duration | Failure Rate | Purpose |
|----------|----------|-------------|---------|
| email_send | 100-2000ms | 5% | Best case — fast, reliable |
| image_resize | 500-8000ms | 15% | Normal case — moderate |
| data_export | 1-15s | 10% | Variable duration |
| report_generate | 3-25s | 30% | Worst case — slow, failure-prone |
| webhook_call | 200ms-10s | 20% | Edge case — network errors |

This approach demonstrates the full job lifecycle (success, failure, retry, DLQ) without requiring actual external services.

---

## 7. Database Schema Normalization

**Decision**: Third Normal Form (3NF) with strategic denormalization.

**3NF Applied**:
- Retry policies are a separate table, referenced by queues. This avoids duplicating retry configuration across queues.
- Job executions are separate from jobs. Each retry creates a new execution row, preserving full history.
- Organizations, projects, and queues form a strict hierarchy.

**Strategic Denormalization**:
- `jobs.retry_count` and `jobs.max_retries`: Could be derived from `job_executions`, but storing directly avoids a JOIN during the hot-path claim query.
- `jobs.error`: Latest error is stored on the job row for quick access. Full error history is in `job_executions`.

---

## 8. Monorepo Structure

**Decision**: npm workspaces with `packages/backend` and `packages/frontend`.

**Rationale**:
- Zero configuration — built into npm.
- Shared `node_modules` at root — faster installs.
- Independent build/deploy — backend to Render, frontend to Vercel.
- Clear separation of concerns while keeping related code together.

**Alternative**: Turborepo or Nx. Rejected as overkill for a two-package setup.

---

## 9. Idempotency

**Decision**: Optional `idempotency_key` per job with a unique partial index.

```sql
CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(queue_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
```

**Why Partial Index**: Only jobs with an idempotency key are indexed. Jobs without one (the majority) don't incur index overhead.

**Behavior**: If a duplicate idempotency key is submitted, the API returns the existing job instead of creating a new one. This is essential for reliable API consumers (retry on network timeout → no duplicate jobs).

---

## 10. Graceful Shutdown

**Decision**: Listen for `SIGTERM`/`SIGINT`, drain active jobs, then exit.

**Sequence**:
1. Set worker status to `draining` (stops claiming new jobs)
2. Wait up to 30 seconds for active jobs to complete
3. Close HTTP server
4. Force exit if deadline exceeded

**Why**: Critical for deployment platforms (Render, Kubernetes) that send SIGTERM before killing processes. Without graceful shutdown, in-flight jobs would be abandoned and need stale detection to recover.
