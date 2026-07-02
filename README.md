# Distributed Job Scheduler — JobForge

A production-grade distributed job scheduling platform built for reliability, concurrency, and observability.

## 🏗️ Architecture

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **Frontend**: Next.js 15 + Tailwind CSS
- **Auth**: JWT (access + refresh tokens)
- **Job Claiming**: PostgreSQL `SELECT FOR UPDATE SKIP LOCKED`
- **Live Updates**: Server-Sent Events (SSE)
- **Monorepo**: npm workspaces

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or Neon free account)

### 1. Clone and Install
```bash
git clone <repo-url>
cd distributed-job-scheduler
npm install
```

### 2. Configure Environment
```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your DATABASE_URL and secrets
```

### 3. Run Migrations
```bash
npm run db:migrate
```

### 4. Seed Demo Data
```bash
npm run db:seed
```

### 5. Start Development
```bash
# Terminal 1: Backend (API + Worker + Scheduler)
npm run dev:backend

# Terminal 2: Frontend
npm run dev:frontend
```

### 6. Access
- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **Login**: `demo@jobscheduler.dev` / `demo123456`

## 🐳 Docker (Optional)
```bash
docker compose up -d   # Starts PostgreSQL
npm run db:migrate
npm run db:seed
```

## 📊 Key Features

| Feature | Description |
|---------|-------------|
| **Multi-tenant** | Organizations → Projects → Queues → Jobs |
| **5 Job Types** | Immediate, Delayed, Scheduled, Recurring (cron), Batch |
| **Atomic Claiming** | `SELECT FOR UPDATE SKIP LOCKED` prevents duplicate execution |
| **3 Retry Strategies** | Fixed, Linear, Exponential backoff with jitter |
| **Dead Letter Queue** | Failed jobs preserved for debugging and manual retry |
| **Worker Heartbeats** | Stale worker detection + automatic job reclamation |
| **Graceful Shutdown** | SIGTERM handler waits for active jobs before exit |
| **Live Dashboard** | SSE-powered real-time metrics and monitoring |
| **Idempotent Jobs** | Idempotency keys prevent duplicate job creation |

## 🧪 Testing
```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage report
```

## 📖 Documentation
- [Architecture Diagram](docs/architecture.md)
- [API Documentation](docs/api-docs.md)
- [Design Decisions](docs/design-decisions.md)

## 🗄️ Database Schema (12 Tables)
Users → Organizations → Projects → Queues → Jobs → Job Executions  
Plus: Retry Policies, Workers, Worker Heartbeats, Job Logs, Scheduled Jobs, Dead Letter Queue

## 📁 Project Structure
```
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/        # Environment, database pool
│   │   │   ├── db/            # Migrations, seed data
│   │   │   ├── middleware/    # Auth, validation, error handling
│   │   │   ├── routes/        # REST API endpoints
│   │   │   ├── utils/         # JWT, retry strategies, errors
│   │   │   ├── worker/        # Worker, scheduler, job executor
│   │   │   └── index.ts       # Express server entry point
│   │   └── tests/
│   └── frontend/
│       └── src/app/
│           ├── dashboard/     # Dashboard pages
│           └── lib/           # API client
├── docs/                      # Architecture, API docs, design decisions
└── docker-compose.yml
```
