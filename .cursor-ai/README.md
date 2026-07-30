# WorkPilot Cursor AI Development Company

Virtual software engineering organization that **builds WorkPilot** inside Cursor.

> **Product** = WorkPilot repository  
> **Builder** = this team (`.cursor-ai/`)  
> Read `COMPANY_RULES.md` first.  
> **매일 사용:** `DAILY_WORKFLOW.md`

---

## Quick Start (CEO)

**Primary interface:** open **`/builder/hq`** in the running app (AI Company Headquarters).

Also:

```text
Enter AI Company
```

Or Cursor command **`/enter-ai-company`**, or CLI `npm run ai-company:enter`.

1. HQ web dashboard shows sprint, agents, task, approvals, health, decisions, releases, live audit feed.
2. Approve with CEO phrases in Cursor when WAITING_CEO.
3. Continue existing Builder Runtime (DISCUSS → … → ship) — no Stage 6.
4. HQ never shows WorkPilot users, Gmail, Calendar, CRM, or customers.
---

## Directory Map

| File | Purpose |
|------|---------|
| `COMPANY_RULES.md` | 회사 헌법 |
| `DAILY_WORKFLOW.md` | 매일 아침 루틴 |
| `DISCUSSION.md` | 토론 / 합의 프로토콜 |
| `CLAUDE_CODE.md` | 구현 실행 브릿지 |
| `CEO.md` | Human CEO |
| `Product.md` | 사용자 가치 |
| `ProjectManager.md` | 로드맵 / 태스크 |
| `Architect.md` | 설계 / ADR |
| `Backend.md` / `Frontend.md` | 엔지니어 |
| `QA.md` | 테스트 게이트 |
| `Security.md` | 보안 게이트 |
| `Reviewer.md` | 코드 리뷰 게이트 |
| `DevOps.md` | CI/CD (prod = CEO) |
| `Orchestrator.md` | 디스패치 / 진행 보고 |
| `*_TEMPLATE.md` | 산출물 템플릿 |

---

## Standard Pipeline (daily)

```
CEO goal
 → DISCUSS (Product, PM, Arch, Eng, QA, Security)
 → PLANNED → ARCHITECT
 → WAITING_CEO          (proposal)
 → IN_PROGRESS          (Claude Code)
 → QA → SECURITY → REVIEW
 → WAITING_CEO          (ship)
 → DONE
```

---

## Artifacts

| Artifact | Path |
|----------|------|
| Task Board SSOT | `docs/ai-team/TASKS.md` |
| Task detail | `docs/ai-team/tasks/TASK-{id}.md` |
| Handoffs (C5) | `docs/ai-team/handoffs/` |
| Runtime | `docs/ai-team/runtime/` |
| Daily ops (Stage 5) | `docs/ai-team/ops/` |
| ADRs | `docs/ai-team/adr/` |

---

## Approval Phrases

| Intent | Example |
|--------|---------|
| Proposal | `Approve TASK-2026-07-28-001 proposal only` |
| Ship | `Approve TASK-2026-07-28-001 only` |
| Scoped phase | `Approve [scope] only` |

---

## Version

| Field | Value |
|-------|--------|
| Company | Cursor AI Development Team |
| Status | Daily-usable (C5 + Stage 4 + Stage 5 Daily Ops) |
| Updated | 2026-07-21 |
