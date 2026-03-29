# Production Deployment Guide

This project is configured for:

- Frontend: Vercel (`apps/web`)
- Backend API: Render Web Service (`@autonomous/api`)
- Worker: Render Background Worker (`@autonomous/api`)
- Postgres: Neon
- Redis: Upstash

## 1. Prerequisites

- Neon project and database created
- Upstash Redis database created
- Groq API key
- Tavily API key

## 2. Environment Variables

### API + Worker (Render)

Use `apps/api/.env.example` as the baseline.

Required in production:

- `NODE_ENV=production`
- `DATABASE_URL=<Neon direct Postgres connection string with sslmode=require>`
- `REDIS_URL=<Upstash rediss URL>`
- `GROQ_API_KEY=<your key>`
- `TAVILY_API_KEY=<your key>`
- `CORS_ALLOWED_ORIGINS=<your Vercel frontend URL>`

Recommended:

- `RUN_MIGRATIONS_ON_BOOT=true` on API service
- `RUN_MIGRATIONS_ON_BOOT=false` on worker service
- `GROQ_TIMEOUT_MS=15000`
- `LOG_LEVEL=info`

### Frontend (Vercel)

Use `apps/web/.env.example` as the baseline.

Required in production:

- `NEXT_PUBLIC_API_URL=https://<your-render-api-domain>`

## 3. Render Setup (API + Worker)

This repository includes `render.yaml` for Blueprint deployment.

Steps:

1. In Render, create a new Blueprint service from this repo.
2. Confirm both services are detected:

- `autonomous-research-api` (web)
- `autonomous-research-worker` (worker)

3. Set all `sync: false` env vars in both services.
4. For API service, set `CORS_ALLOWED_ORIGINS` to your Vercel domain.
5. Deploy.

Health checks:

- API health endpoint: `/health`

## 4. Vercel Setup (Frontend)

Steps:

1. Import this repo into Vercel.
2. Set Root Directory to `apps/web`.
3. Confirm framework is Next.js.
4. Set production env var:

- `NEXT_PUBLIC_API_URL=https://<your-render-api-domain>`

5. Deploy.

## 5. Safe Rollout Order

To minimize breakage:

1. Provision Neon and Upstash first.
2. Deploy Render API service and wait until `/health` returns `200`.
3. Deploy Render worker service.
4. Deploy Vercel frontend with `NEXT_PUBLIC_API_URL` pointed at Render API.

## 6. Local Verification Before Deploy

From repo root:

```bash
npm ci
npm run build:api
npm run build:web
```

Then verify API locally with production-like envs:

```bash
npm run start -w @autonomous/api
npm run start:worker -w @autonomous/api
```

## 7. Notes

- The frontend now fails fast in production if `NEXT_PUBLIC_API_URL` is missing, to prevent accidental calls to `localhost`.
- API CORS is strict in production and requires `CORS_ALLOWED_ORIGINS`.
- Migrations can run on API boot only, avoiding migration races when worker boots at the same time.
