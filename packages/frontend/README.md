# JobForge — Frontend Dashboard

A Next.js 16 web application for the **JobForge Distributed Job Scheduler** platform.

## 🔗 Live Demo
- **Frontend**: [https://distributed-job-scheduler-frontend-six.vercel.app/](https://distributed-job-scheduler-frontend-six.vercel.app/)
- **Backend API**: [https://jobscheduler-backend.onrender.com](https://jobscheduler-backend.onrender.com)

## 🛠 Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + Custom Glassmorphism CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **Auth**: JWT stored in localStorage

## 🚀 Getting Started

### Prerequisites
- Node.js v20+
- Backend API running at `http://localhost:3001`

### Development

```bash
# From the monorepo root
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Environment Variables

Create a `.env.local` file in this directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Production Build

```bash
npm run build:frontend
```

## 📂 Project Structure

```
src/app/
├── page.tsx                    # Login / Register page
├── globals.css                 # Global styles + glassmorphism utilities
├── layout.tsx                  # Root layout
├── dashboard/
│   ├── layout.tsx              # Sidebar + mobile drawer layout
│   ├── page.tsx                # Main dashboard stats
│   ├── queues/
│   │   ├── page.tsx            # Queue list view
│   │   └── [queueId]/page.tsx  # Queue details + job table
│   ├── workers/page.tsx        # Worker monitoring
│   ├── dlq/page.tsx            # Dead Letter Queue
│   ├── jobs/[jobId]/page.tsx   # Job execution detail
│   └── settings/page.tsx       # Retry policies + account settings
└── lib/
    └── api.ts                  # Typed API client (REST + SSE)
```

## 🎨 Design System
The UI uses a **"Midnight Minimalist"** design aesthetic with:
- Deep black backgrounds (`#000000`)
- Glassmorphism cards (`backdrop-blur`, `bg-white/[0.03]`)
- Animated background orbs for depth
- Responsive layout: desktop sidebar + mobile hamburger drawer
