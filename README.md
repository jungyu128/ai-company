# AI Company

Private internal AI development company that builds **WorkPilot** (`jungyu128/workpilot`).

## Quick start

```bash
cp .env.example .env.local
# set AI_COMPANY_OWNER_TOKEN and optionally GITHUB_TOKEN
npm install
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to `/builder/hq`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Prisma generate + production build |
| `npm run test:builder` | Migrated builder unit tests |
| `npm run ai-company:enter` | HQ CLI summary |

## WorkPilot GitHub connection

Server-only env vars:

- `WORKPILOT_GITHUB_OWNER` (default `jungyu128`)
- `WORKPILOT_GITHUB_REPO` (default `workpilot`)
- `WORKPILOT_GITHUB_BRANCH` (default `main`)
- `GITHUB_TOKEN` (never expose to the client)

UI: `/builder/hq/repository`  
API: `/api/builder/hq/github` (calls `src/services/github` only)

Safety: no auto-merge, no direct pushes to main, writes require `ownerApproved: true`.

## Auth

Owner-token cookie/header gate. Set `AI_COMPANY_DEV_BYPASS_AUTH=1` for local development only.
