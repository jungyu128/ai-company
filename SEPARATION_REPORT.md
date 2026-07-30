# AI Company Separation Report

**Date:** 2026-07-30  
**Source:** `C:\Users\jaw88\.cursor\projects\empty-window\workpilot`  
**Target:** `C:\Users\jaw88\.cursor\projects\empty-window\ai-company`  

WorkPilot was **not** modified. AI Company remains inside WorkPilot for now.

---

## Verification results

| Check | Result |
|-------|--------|
| `npm install` | Pass |
| `npx prisma generate` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| Builder tests (`src/__tests__/builder`) | **155 pass** (152 migrated + 3 GitHub safety) |

---

## Exact migrated trees (from WorkPilot)

Copied as-is (scoped island; not whole app):

- `src/app/(builder)/` — HQ pages + Live Office CSS
- `src/app/api/builder/` — HQ APIs
- `src/features/builder/` — UI (including Live Office)
- `src/services/builder/` — missions, memory, approvals, conversations, employees, etc.
- `src/__tests__/builder/` — unit tests
- `docs/ai-team/` — runtime + ops JSON stores (required for HQ persistence)
- `.cursor-ai/` — Orchestrator / agent workflow docs
- `.cursor/rules/ai-company.mdc`
- `.cursor/commands/enter-ai-company.md`

**Not copied:** WorkPilot product app, Supabase auth stack, CRM/email product services, marketplace builder, shared `@/components` design system.

---

## Exact new files (AI Company only)

### App shell / config
- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `postcss.config.mjs`
- `eslint.config.mjs`
- `.gitignore`
- `.env.example`
- `.env.local` (local only; gitignored)
- `README.md`
- `SEPARATION_REPORT.md` (this file)
- `prisma/schema.prisma` — minimal SQLite (`OwnerSession`, `GitHubActionAudit`)
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx` — `/` → `/builder/hq`
- `src/app/login/page.tsx`
- `src/app/api/auth/owner-login/route.ts`
- `src/middleware.ts`
- `src/lib/auth.ts` — owner-token guard (replaces WorkPilot `@/lib/auth`)

### GitHub integration (service layer)
- `src/services/github/github-config.ts`
- `src/services/github/github-client.ts`
- `src/services/github/github-safety.ts`
- `src/services/github/github.service.ts`
- `src/services/github/index.ts`
- `src/app/api/builder/hq/github/route.ts` — thin route → services only
- `src/app/(builder)/builder/hq/repository/page.tsx` — connection UI
- `src/__tests__/builder/github-safety.test.ts`

### Employee / UX adjustments in migrated copies
- `src/services/builder/ai-company-employees.ts` — WorkPilot product roles mapped onto existing 8 employees
- Live Office desk/zone labels updated to product departments
- HQ header link to WorkPilot repo page

---

## Dependencies copied / installed

From WorkPilot, only what AI Company needs:

**runtime:** `next@16.2.10`, `react@19.2.4`, `react-dom@19.2.4`, `@prisma/client@^6.19.3`  
**dev:** `typescript`, `tsx`, `prisma`, `tailwindcss@4`, `@tailwindcss/postcss`, `@types/*`, `eslint`, `eslint-config-next`

**Not installed** (unused by builder island): Supabase, OpenAI SDK, TanStack Query, lucide, framer-motion, zod, etc.

---

## Remaining coupling with WorkPilot

| Coupling | Notes |
|----------|--------|
| Product repository | Configured via `WORKPILOT_GITHUB_*` + `GITHUB_TOKEN` — AI Company builds WorkPilot through GitHub PRs |
| Conceptual | Employees/missions still describe WorkPilot product work |
| Docs/runtime paths | Still use `docs/ai-team/ops` relative layout (same as before) |
| Code duplication | Builder code still exists inside WorkPilot until a later removal task |
| No runtime import | Standalone app does **not** import WorkPilot packages or call WorkPilot servers |

---

## Environment variables required

| Variable | Purpose |
|----------|---------|
| `INTERNAL_AI_COMPANY_ENABLED` | Feature gate for HQ |
| `AI_COMPANY_OWNER_TOKEN` | Owner access cookie/header |
| `AI_COMPANY_OWNER_ID` / `_EMAIL` / `_NAME` | Owner identity |
| `AI_COMPANY_DEV_BYPASS_AUTH` | Local-only auth bypass (`1`) |
| `WORKPILOT_GITHUB_OWNER` | default `jungyu128` |
| `WORKPILOT_GITHUB_REPO` | default `workpilot` |
| `WORKPILOT_GITHUB_BRANCH` | default `main` |
| `GITHUB_TOKEN` | Server-only GitHub API (never to client) |
| `DATABASE_URL` | Prisma SQLite (`file:./dev.db`) |
| Optional Google connector vars | Same as WorkPilot builder live connectors |

---

## Employee → WorkPilot responsibility map

| ID | Name | productRole | Responsibility |
|----|------|-------------|----------------|
| sarah | Sarah | ceo | Final recommendation + approval request |
| emma | Emma | product | Requirements & priorities |
| david | David | cto | Architecture & implementation plan |
| mia | Mia | frontend | UI work |
| noah | Noah | backend | API & database |
| olivia | Olivia | backend | Data/finance API support |
| ethan | Ethan | qa | Tests & verification |
| alex | Alex | devops | Build & deployment checks |

All eight employees preserved.

---

## Commands to create and push the GitHub repository

```powershell
cd C:\Users\jaw88\.cursor\projects\empty-window\ai-company

# Ensure remote repo exists (private):
# gh repo create jungyu128/ai-company --private --source=. --remote=origin --push

git add .
git status
git commit -m "Initial AI Company extraction from WorkPilot builder island."

# If repo already created empty on GitHub:
git remote add origin https://github.com/jungyu128/ai-company.git
git push -u origin main
```

Using GitHub CLI (preferred):

```powershell
cd C:\Users\jaw88\.cursor\projects\empty-window\ai-company
gh auth status
gh repo create jungyu128/ai-company --private --source=. --remote=origin --push
```

---

## Safety notes (GitHub writes)

- Never merge automatically (`mergePullRequest` always throws)
- Never push/write to `main` / `master`
- Writes require `ownerApproved: true` + reason
- `GITHUB_TOKEN` used only in `src/services/github/*` (server)

---

## Stop condition

Independent AI Company project installs, generates Prisma client, typechecks, builds, and runs migrated builder tests successfully. WorkPilot deployment untouched.
