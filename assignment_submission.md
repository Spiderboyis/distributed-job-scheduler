# JobForge: Distributed Job Scheduler

## Live Deployments
- **Frontend App (Vercel)**: [https://distributed-job-scheduler-frontend-six.vercel.app/](https://distributed-job-scheduler-frontend-six.vercel.app/)
- **Backend API & Worker (Render)**: [https://jobscheduler-backend.onrender.com](https://jobscheduler-backend.onrender.com)

---

## 1. Setup & Deployment Instructions

### 1.1 Prerequisites
- Node.js (v24.x)
- PostgreSQL (v15+)
- Docker & Docker Compose
- Git

### 1.2 Local Setup (Development)
1. Clone the repository and install workspace dependencies:
```bash
git clone https://github.com/Spiderboyis/distributed-job-scheduler.git
cd distributed-job-scheduler
npm install
```

2. Configure Environment Variables:
Create a `.env` file in `packages/backend`:
```env
PORT=3001
DATABASE_URL=postgresql://jobscheduler:jobscheduler_secret@localhost:5432/jobscheduler
JWT_SECRET=your_super_secret_key
JWT_REFRESH_SECRET=your_refresh_secret
NODE_ENV=development
```

3. Database Migration & Seeding:
```bash
# Run PostgreSQL migrations
npm run db:migrate --workspace=packages/backend

# (Optional) Seed the database with demo data
npm run db:seed --workspace=packages/backend
```

4. Start the Application:
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

---

### 1.3 Docker & Docker Compose Setup
To launch the complete PostgreSQL Database, Express.js Backend, and Next.js Frontend stack inside isolated Docker containers, simply run:
```bash
docker compose up --build
```
This automatically builds the containers, runs migrations, and links the services together. The services will be accessible at:
- **Frontend Panel**: `http://localhost:3000`
- **Backend API**: `http://localhost:3001`
- **PostgreSQL Database**: `localhost:5432` (credentials: `jobscheduler` / `jobscheduler_secret`)

---

### 1.4 Production Deployment (Render / Cloud)
This application is configured for direct cloud deployment using services like Render, Vercel, and cloud PostgreSQL databases.

#### Database Deployment (PostgreSQL):
- **Platform**: Managed production-grade PostgreSQL (v15+) instance hosted on **Render PostgreSQL** (or equivalent cloud providers like Supabase, Neon, or AWS RDS).
- **Configuration**: Handles concurrent connections from distributed workers via connection pooling.
- **Trigger Triggers**: Relies on PostgreSQL trigger mechanisms and `LISTEN`/`NOTIFY` to stream real-time updates (through Server-Sent Events) to the React dashboard.
- **Migrations**: Automated migrations run dynamically prior to service startup using the connection string configured under `DATABASE_URL`.

#### Backend & Worker Deployment:
- **Host**: **Render** (Web Service & Cron / Background Workers)
- **Build Command**: `npm install --include=dev && npm run build:backend`
- **Start Command**: `npm run db:migrate && node packages/backend/dist/index.js`
- **Port**: `3001`
- **Environment Variables**:
  - `DATABASE_URL`: Connection string pointing to your managed cloud PostgreSQL database.
  - `JWT_SECRET` & `JWT_REFRESH_SECRET`: Secure cryptographic keys.
  - `NODE_ENV`: `production`

#### Frontend Deployment:
- **Host**: **Vercel**
- **Build Command**: `npm install --include=dev && npm run build:frontend`
- **Start Command**: `npm run start --workspace=packages/frontend`
- **Port**: `3000`
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: `https://jobscheduler-backend.onrender.com` (Public address of your deployed Backend API on Render).

---

## 2. Architecture Diagram

![Architecture Diagram](./architecture.png)

---

## 3. Entity Relationship (ER) Diagram

![ER Diagram](./er.png)

---

## 4. Visual Deliverables & UI Screenshots

### 4.1 Login Page & Glassmorphism Design
The login page has been rewritten with a modern iOS-inspired glassmorphism layout, featuring floating blurred glowing orbs in the background and a sleek, authentic card design. Default demo credentials are removed from state but preserved as a small help hint.

![Login Page](./login_page.png)

### 4.2 Dashboard & Tenant Isolation
All database select operations have been restricted using PostgreSQL joins against the `org_members` table. When logging in as a newly created user, the metrics, queues, and active worker stats show exactly `0` values rather than displaying global demo queue stats, verifying airtight tenant isolation.

![Dashboard](./dashboard.png)

### 4.3 Settings Page
The Settings tab has been streamlined to highlight retry policies, simple sign-out action, and a secure account deletion flow requiring password validation.

![Settings](./settings.png)

---

## 5. API Documentation

### Authentication & Account
- `POST /api/auth/register`: Register a new user.
- `POST /api/auth/login`: Authenticate and receive a JWT.
- `DELETE /api/auth/account`: Securely delete the account and securely cascade-delete all owned resources (organizations, queues, jobs).

### Queues
- `GET /api/projects/:projectId/queues`: List all queues in a project.
- `POST /api/projects/:projectId/queues`: Create a new queue with specific concurrency and retry policies.
- `POST /api/queues/:queueId/pause` / `resume`: Halt or resume job processing for a queue.
- `GET /api/queues/:queueId/stats`: Fetch real-time metrics (throughput, failure rates) for a queue.

### Jobs
- `POST /api/queues/:queueId/jobs`: Enqueue a new immediate, delayed, or scheduled job.
- `POST /api/queues/:queueId/jobs/batch`: Atomically enqueue up to 100 jobs at once.
- `GET /api/queues/:queueId/jobs`: Fetch paginated jobs with status filtering.
- `GET /api/jobs/:jobId`: Get detailed execution history and logs for a specific job.
- `POST /api/jobs/:jobId/retry`: Manually requeue a failed or dead job.

### Live Metrics (SSE)
- `GET /api/sse/events?token={JWT}`: Streams real-time, tenant-isolated dashboard metrics via Server-Sent Events.

---

## 6. Design Decisions & Trade-offs

### 1. Database as the Message Queue
**Decision:** We utilized PostgreSQL to handle job queuing rather than introducing a specialized broker like Redis or RabbitMQ.
**Trade-off:** While Redis offers superior pure in-memory throughput, utilizing Postgres with `FOR UPDATE SKIP LOCKED` provides robust, atomic job claiming. This significantly reduces infrastructure complexity, ensures strict ACID compliance, and inherently solves the "two-phase commit" problem where database state and queue state become misaligned. 

### 2. Event-Driven Live Updates (SSE vs WebSockets)
**Decision:** We chose Server-Sent Events (SSE) over WebSockets for dashboard live updates, powered by Postgres `LISTEN/NOTIFY`.
**Trade-off:** WebSockets provide bi-directional communication, but our dashboard only requires unidirectional data flow (server-to-client). SSE is natively supported by HTTP/1.1, avoids complex handshake overhead, automatically handles reconnections, and seamlessly propagates database triggers to the React frontend.

### 3. Tenant Data Isolation
**Decision:** All resources structurally cascade from an `Organization`, and security is enforced at the SQL level via explicit `JOIN`s against the `org_members` table on every backend route.
**Trade-off:** This introduces slight overhead on read queries due to multi-table joins. However, it guarantees airtight multi-tenancy. A user completely dropping their account will safely `CASCADE DELETE` all their data without risking global data corruption, which is a critical requirement for a distributed SaaS environment.

### 4. UI/UX: High-Fidelity Glassmorphism
**Decision:** We bypassed generic UI libraries in favor of a custom, heavily polished "Midnight Minimalist" aesthetic featuring dynamic background orbs and deep `backdrop-blur-2xl` glass cards.
**Trade-off:** It takes significantly more CSS optimization (especially performance tuning for blurs) than importing a standard Tailwind UI kit. However, it successfully delivers a highly premium, state-of-the-art "Wow" factor requested for modern developer tooling.
