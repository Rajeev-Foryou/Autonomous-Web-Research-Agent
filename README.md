# Autonomous Web Research Agent

Autonomous Web Research Agent is a production-oriented, monorepo-based application that accepts a user research query, runs an AI-assisted multi-stage research workflow, and returns a structured report with sources.

The system combines:

- A Next.js frontend for query input, live status tracking, and report display
- An Express API for job creation and status/result retrieval
- A BullMQ worker for asynchronous research execution
- Neon Postgres for persistence
- Upstash Redis for queue transport

## What It Does

1. User submits a query from the web UI.
2. API creates a job record and enqueues work in Redis.
3. Worker picks the job and executes staged processing:

- planning
- research
- scraping
- summarizing

4. Worker stores job progress, sources, and final report in Postgres.
5. Frontend polls status endpoint and renders progress until completion.

## Tech Stack

### Frontend

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS

### Backend

- Node.js + TypeScript
- Express
- BullMQ + ioredis
- Prisma ORM (+ Prisma Postgres adapter)
- Pino logging

### AI and Data Sources

- Groq API (LLM inference)
- Tavily API (web search)
- Playwright and HTTP scraping utilities

### Infrastructure

- Neon (Postgres)
- Upstash (Redis)
- Vercel (frontend)
- Render (API and worker, or single-service fallback)

## Monorepo Structure

- apps/api: Express API, queue producer, worker, Prisma schema, business logic
- apps/web: Next.js frontend
- packages/types: shared TypeScript types package
- render.yaml: Render Blueprint configuration for split API+worker deployment
- DEPLOYMENT.md: deployment-specific runbook

## Core Workflow

### Stage Lifecycle

The job lifecycle is tracked in database using status and current stage fields.

Status values:

- pending
- running
- completed
- failed

Stage values exposed to frontend:

- planning
- research
- scraping
- summarizing
- completed
- failed

### Queue Pattern

- API enqueues to BullMQ queue: research-queue
- Worker consumes jobs from the same queue
- API and worker communicate indirectly through Redis (queue) and Postgres (state)

## API Surface

Base URL: https://autonomous-web-research-agent-2.onrender.com

### Health

- GET /
- GET /health

Response:

- 200 { "status": "ok" }

### Metrics

- GET /metrics

Returns aggregate metrics such as total jobs, success rate, and completion-time stats.

### Create Research Job

- POST /research

Request body:

- { "query": "your topic" }

Optional header:

- x-idempotency-key: unique key for deduping repeated submits

Response:

- 202 for new job
- 200 for deduplicated existing job

Payload contains:

- jobId
- status
- currentStage
- progress

### Get Job Status

- GET /research/:id/status

Response:

- jobId
- status
- currentStage
- progress

### Get Final Result

- GET /research/:id

Response includes:

- report: title, keyInsights, comparison, conclusion
- sources: list of source title and URL

## Environment Variables

### API and Worker

Required in production:

- NODE_ENV=production
- DATABASE_URL=postgresql://...
- REDIS_URL=rediss://...
- GROQ_API_KEY=...
- TAVILY_API_KEY=...
- CORS_ALLOWED_ORIGINS=https://autonomous-web-research-agent-web.vercel.app/

Recommended:

- RUN_MIGRATIONS_ON_BOOT=true (API)
- RUN_MIGRATIONS_ON_BOOT=false (worker)
- RATE_LIMIT_ENABLED=true
- RATE_LIMIT_WINDOW_MS=60000
- RATE_LIMIT_MAX_REQUESTS=60
- GROQ_TIMEOUT_MS=15000
- LOG_LEVEL=info

Notes:

- CORS_ALLOWED_ORIGINS is enforced in production by env validation.
- Use comma-separated origins if needed.

### Frontend

Required in production:

- NEXT_PUBLIC_API_URL=https://autonomous-web-research-agent-2.onrender.com

## Local Development

Prerequisites:

- Node.js 20+
- npm 10+
- Neon DB URL
- Upstash Redis URL
- Groq and Tavily API keys

1. Install dependencies

npm ci

2. Build shared package once

npm run build:types

3. Configure environment

- Copy apps/api/.env.example to apps/api/.env and fill values
- Copy apps/web/.env.example to apps/web/.env and set NEXT_PUBLIC_API_URL

4. Run API

npm run dev -w @autonomous/api

5. Run worker

npm run worker -w @autonomous/api

6. Run frontend

npm run dev -w @autonomous/web

## Build Commands

From repository root:

- Build API: npm run build:api
- Build Web: npm run build:web

## Deployment Modes

### Recommended: Split Services

- Frontend: Vercel
- API: Render Web Service
- Worker: Render Background Worker

This is the most reliable and scalable model.

### Budget Fallback: Single Render Web Service

If background workers are not available on your Render tier, you can run API and worker in one service.

Build Command:

npm ci --include=dev && npm run build:api

Optional Pre-Deploy Command:

npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

Start Command:

sh -c "npm run start -w @autonomous/api & npm run start:worker -w @autonomous/api & wait"

Health Check Path:

/health

Single-service tradeoffs:

- Less resilient than split services
- Harder independent scaling
- Process management is less clean

## Render and Vercel Notes

- Keep API and worker in same region as close as possible to Neon and Upstash.
- Configure frontend NEXT_PUBLIC_API_URL to API service URL.
- Configure API CORS_ALLOWED_ORIGINS to exact frontend origin (no trailing slash needed).

## Common Issues and Fixes

### Missing Type Declarations During Render Build

Symptom:

- Could not find declaration file for module express or cors

Fix:

- Use build command with dev dependencies:
  npm ci --include=dev && npm run build:api

### CORS_ALLOWED_ORIGINS required in production

Symptom:

- Startup fails with CORS_ALLOWED_ORIGINS is required in production

Fix:

- Add CORS_ALLOWED_ORIGINS env var in service settings.

### No open ports detected

Symptom:

- Render logs show no open ports detected

Cause:

- Worker process running in a Web Service without API server binding

Fix:

- Use API start command for web service, or deploy worker as background worker.

## Security and Operations

- Do not commit .env files.
- Rotate credentials immediately if exposed in logs or chat.
- Prefer verify-full SSL mode for Postgres URLs where supported.
- Monitor queue backlog and average completion time in metrics endpoint.

## Project Scripts Reference

Root scripts:

- dev
- dev:api
- dev:web
- build:types
- build:api
- build:web

API scripts:

- dev
- worker
- build
- start
- start:worker
- prisma:generate

Web scripts:

- dev
- build
- start

## Deployed Link

https://autonomous-web-research-agent-web.vercel.app/

## License

No explicit license file is currently included in this repository. Add one before public distribution.
