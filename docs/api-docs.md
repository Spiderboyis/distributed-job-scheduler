# API Documentation

Base URL: `http://localhost:3001/api`

## Authentication

All endpoints except `/auth/login` and `/auth/register` require a Bearer token.

```
Authorization: Bearer <access_token>
```

Alternative: API Key via header `X-API-Key: jsk_...`

---

## Auth Endpoints

### POST /auth/register
Create a new user account.
```json
// Request
{ "email": "user@example.com", "password": "secret123", "name": "John Doe" }
// Response 201
{ "user": { "id": "uuid", "email": "...", "name": "..." }, "tokens": { "accessToken": "...", "refreshToken": "..." } }
```

### POST /auth/login
```json
// Request
{ "email": "user@example.com", "password": "secret123" }
// Response 200
{ "user": { ... }, "tokens": { "accessToken": "...", "refreshToken": "..." } }
```

### POST /auth/refresh
```json
{ "refreshToken": "..." }
// Response 200
{ "tokens": { "accessToken": "...", "refreshToken": "..." } }
```

### GET /auth/me
Returns current user profile with organizations.

---

## Organization Endpoints

### POST /orgs
```json
{ "name": "My Org", "slug": "my-org" }
```

### GET /orgs
List user's organizations.

### GET /orgs/:orgId
Organization detail with members.

### POST /orgs/:orgId/members
```json
{ "email": "member@example.com", "role": "admin" }
```

---

## Project Endpoints

### POST /projects
```json
{ "name": "My Project", "slug": "my-project", "organizationId": "uuid" }
```

### GET /projects?organizationId=uuid
List projects.

### GET /projects/:projectId
Project detail.

### POST /projects/:projectId/regenerate-key
Regenerate API key.

---

## Queue Endpoints

### POST /projects/:projectId/queues
```json
{ "name": "Email Queue", "slug": "email-queue", "priority": 10, "concurrency": 5, "retryPolicyId": "uuid" }
```

### GET /projects/:projectId/queues
List queues with job count stats.

### GET /queues/:queueId
Queue detail with full stats.

### PATCH /queues/:queueId
```json
{ "priority": 5, "concurrency": 10, "isPaused": true }
```

### POST /queues/:queueId/pause
Pause queue (workers skip it).

### POST /queues/:queueId/resume
Resume queue.

### GET /queues/:queueId/stats
Detailed statistics: counts, avg/p95 duration, hourly throughput.

---

## Job Endpoints

### POST /queues/:queueId/jobs
Create a single job.
```json
{
  "name": "send-welcome-email",
  "type": "immediate",           // immediate | delayed | scheduled | recurring | batch
  "payload": { "to": "user@example.com", "template": "welcome" },
  "priority": 5,
  "scheduledAt": "2026-07-02T12:00:00Z",  // for delayed/scheduled
  "idempotencyKey": "email-123",           // optional, prevents duplicates
  "timeoutMs": 30000,
  "maxRetries": 3
}
```

### POST /queues/:queueId/jobs/batch
Create multiple jobs atomically.
```json
{
  "jobs": [
    { "name": "job-1", "payload": { ... } },
    { "name": "job-2", "payload": { ... } }
  ]
}
// Response: { "batchId": "uuid", "jobs": [...], "count": 2 }
```

### GET /queues/:queueId/jobs?status=queued&type=immediate&page=1&limit=20
List jobs with pagination and filtering.

### GET /jobs/:jobId
Job detail with execution history and logs.

### POST /jobs/:jobId/retry
Manually retry a failed/dead job. Creates a new job.

### DELETE /jobs/:jobId
Cancel a queued/scheduled job.

---

## Scheduled Job Endpoints

### POST /queues/:queueId/scheduled
```json
{ "name": "Hourly Digest", "cronExpression": "0 * * * *", "timezone": "UTC", "payload": { ... } }
```

### GET /queues/:queueId/scheduled
List cron job definitions.

### PATCH /scheduled/:id
Update cron expression or toggle active.

### DELETE /scheduled/:id

---

## Worker & Dashboard Endpoints

### GET /workers
List all workers with health metrics.

### GET /workers/:workerId
Worker detail with heartbeat history.

### GET /workers/dlq/entries?page=1&limit=20
List Dead Letter Queue entries.

### POST /dlq/:id/retry
Retry a DLQ entry.

### GET /workers/dashboard/stats
Dashboard overview: job counts, worker status, queue health.

---

## SSE (Live Updates)

### GET /sse/events
Server-Sent Events stream. Pushes job/worker stats every 3 seconds.
```
Content-Type: text/event-stream

data: {"jobs":{"total":100,"queued":5,"running":2,...},"workers":{"total":1,"active":1},"timestamp":"..."}
```

---

## Error Format
All errors follow a consistent format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "Required" }],
    "requestId": "uuid"
  }
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`
