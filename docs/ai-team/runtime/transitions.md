# Role Transition Engine

Phase C5+ — allowed role and state transitions (daily AI Company).

---

## Agent state transitions

| From | Allowed to |
|------|------------|
| Offline | Idle |
| Idle | Assigned, Offline |
| Assigned | Working, Blocked, Idle |
| Working | Waiting, Reviewing, Completed, Failed, Blocked |
| Waiting | Working, Blocked, Failed |
| Blocked | Assigned, Idle |
| Reviewing | Completed, Failed, Working |
| Completed | Idle |
| Failed | Assigned, Idle |

Validated by `canTransitionAgentState(from, to)` in `lib/runtime-core.mjs`.

---

## Task status transitions

| From | Allowed to |
|------|------------|
| BACKLOG | DISCUSS, PLANNED, CANCELLED |
| DISCUSS | PLANNED, ARCHITECT, WAITING_CEO, BLOCKED, CANCELLED |
| PLANNED | ARCHITECT, DISCUSS, IN_PROGRESS, BLOCKED, CANCELLED |
| ARCHITECT | PLANNED, WAITING_CEO, IN_PROGRESS, BLOCKED, CANCELLED |
| IN_PROGRESS | QA, BLOCKED, WAITING_CEO, CANCELLED |
| QA | IN_PROGRESS, SECURITY, REVIEW, BLOCKED, CANCELLED |
| SECURITY | QA, IN_PROGRESS, REVIEW, BLOCKED, CANCELLED |
| REVIEW | IN_PROGRESS, WAITING_CEO, DONE, BLOCKED, CANCELLED |
| WAITING_CEO | DONE, IN_PROGRESS, PLANNED, DISCUSS, BLOCKED, CANCELLED |
| BLOCKED | DISCUSS, PLANNED, ARCHITECT, IN_PROGRESS, QA, SECURITY, REVIEW, BACKLOG |
| DONE | — |
| CANCELLED | — |

Stage 4: `advanceTask` / `cancelTask` enforce these transitions; cancel is denied while the session advance lock is held; terminal statuses are protected.

---

## Daily pipeline (two CEO gates)

```
CEO goal
 → DISCUSS (Product, PM, Arch, Eng, QA, Security challenge)
 → PLANNED (PM roadmap)
 → ARCHITECT (design)
 → WAITING_CEO          ← proposal approval
 → IN_PROGRESS          ← Claude Code executes
 → QA → SECURITY → REVIEW
 → WAITING_CEO          ← ship approval
 → DONE
```

---

## Role handoff matrix (key)

| From | To | Status change |
|------|-----|---------------|
| PM | Product/team | BACKLOG → DISCUSS |
| Discussion | PM | DISCUSS → PLANNED |
| PM | Architect | PLANNED → ARCHITECT |
| Architect | CEO path | ARCHITECT → WAITING_CEO (proposal) |
| CEO | Backend/Frontend | WAITING_CEO → IN_PROGRESS |
| Engineer | QA | IN_PROGRESS → QA |
| QA | Security | QA → SECURITY |
| Security | Reviewer | SECURITY → REVIEW |
| Reviewer | CEO path | REVIEW → WAITING_CEO (ship) |
| CEO | Done | WAITING_CEO → DONE |

---

## Role capability matrix

| Action | PM | Product | Arch | BE | FE | QA | Sec | Rev | DevOps |
|--------|:--:|:-------:|:----:|:--:|:--:|:--:|:---:|:---:|:------:|
| create_task | ✅ | | | | | | | | |
| facilitate_discussion | ✅ | ✅ | | | | | | | |
| product_review | | ✅ | | | | | | | |
| write_adr | | | ✅ | | | | | | |
| write_product_code | | | | ✅ | ✅ | | | | |
| run_tests | | | | | | ✅ | | | |
| security_review | | | | | | | ✅ | | |
| code_review | | | | | | | | ✅ | |
| deploy_* | | | | | | | | | ✅ |

---

## Claude Code

See `.cursor-ai/CLAUDE_CODE.md`. Coding starts only after proposal CEO approval.
