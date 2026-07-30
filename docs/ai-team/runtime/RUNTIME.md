# Agent Runtime — Protocol (Phase C4 + Stage 4 + Stage 5 Daily Ops)

> Session-based execution kernel for the Cursor AI Development Team.  
> **Not** WorkPilot product code. Integrates with Task Board (C2).

---

## Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Runtime core** | `lib/runtime-core.mjs` | State machines, dispatch, availability lock, advance/cancel, validation |
| **Runtime ops** | `lib/runtime-ops.mjs` | Stage 5 daily ops builders/validators |
| **Runtime controller** | `lib/runtime-controller.mjs` | Session audit + advance lock + ops hooks |
| **Agent registry** | `agents/AGENT-*.md` | Per-role lifecycle state (`currentTask` occupancy) |
| **Audit log** | `audit/AUDIT.log.md` | Append-only audit trail |
| **Session logs** | `sessions/` | Per-session runtime events |
| **Daily ops artifacts** | `docs/ai-team/ops/` | Briefings, HQ, sprints, memory, debt, release |
| **HQ entry** | `lib/runtime-hq.mjs` + `bin/enter-ai-company.mjs` | CEO headquarters dashboard |
| **Orchestrator** | `.cursor-ai/Orchestrator.md` | Entry point contract |

---

## Stage 4 — Beta Stabilization (builder)

| Fix | Rule |
|-----|------|
| **Employee availability lock** | Occupied states `Assigned` / `Working` / `Waiting` / `Reviewing` with a `currentTaskId` **reject** dispatch to a different task — never overwrite |
| **Advance / cancel consistency** | `advanceTask` / `cancelTask`; cancel denied while session advance lock held; terminal `DONE`/`CANCELLED` protected |
| **CEO task validation** | `validateCeoTaskInput()` — taskId, title, ceoGoal, priority, owner, AC |
| **Discussion reliability** | `validateDiscussionRecord()` — ≥2 positions + ≥1 challenge + recommendation |
| **CEO approval reliability** | `validateCeoApprovalPhrase()` / `canRecordCeoApproval()` only in `WAITING_CEO` |

Busy handling remains **reject** (no queue) — matches existing architecture.

---

## Stage 5 — Daily Operations (builder)

| Capability | API | Artifact |
|------------|-----|----------|
| Daily CEO briefing | `buildDailyCeoBriefing` | `ops/briefings/` |
| Sprint planning | `validateSprintPlan` | `ops/sprints/` + `SPRINTS.md` |
| Company decision memory | `validateDecisionMemory` | `ops/DECISION_MEMORY.md` |
| Automatic improvements | `proposeImprovements` | `ops/IMPROVEMENT_BACKLOG.md` |
| Weekly engineering report | `buildWeeklyEngineeringReport` | `ops/reports/` |
| Release checklist | `validateReleaseChecklist` | `ops/RELEASE_CHECKLIST.md` |
| Technical debt | `validateTechDebtItem` / `prioritizeTechDebt` | `ops/TECH_DEBT.md` |

Preserves Stage 4 lifecycle; ops do not redesign the state machine. See [ops/README.md](../ops/README.md).

---

## Agent States

`Idle` | `Assigned` | `Working` | `Waiting` | `Blocked` | `Reviewing` | `Completed` | `Failed` | `Offline`

See [transitions.md](./transitions.md) for allowed transitions.

---

## Dispatch Protocol

Before any role executes work:

1. Read task from `docs/ai-team/tasks/{TASK-ID}.md`
2. Read agent state from `runtime/agents/AGENT-{ROLE}.md`
3. Call `validateDispatch()` (includes availability lock)
4. On success: update agent state + `currentTask` + task activity + audit
5. On failure: log `DISPATCH_DENIED`; do not proceed / do not overwrite agent file

**One task at a time:** Occupied agent cannot accept a different `taskId`.

---

## Advance / Cancel (Stage 4)

```javascript
const session = createRuntimeSession(sessionId);
session.beginAdvance(taskId);   // hold lock for multi-step work
// ... mutate task status safely ...
session.endAdvance(taskId);

// or one-shot:
session.advanceTask({ from, to, taskId, ceoApproved });
session.cancelTask({ from, taskId }); // fails if advance lock held or terminal
```

---

## Task Execution Controller

| Task status | Owner role |
|-------------|------------|
| BACKLOG, DISCUSS, PLANNED, BLOCKED | PM (Product on DISCUSS/PLANNED) |
| ARCHITECT | Architect |
| IN_PROGRESS | Backend / Frontend |
| QA | QA |
| SECURITY | Security |
| REVIEW | Reviewer |
| WAITING_CEO | CEO (agents `Waiting`) |

---

## Approval Checkpoints

See [approval-checkpoints.md](./approval-checkpoints.md).

Runtime: `requiresCeoApproval()`, `canMarkDone()`, `canRecordCeoApproval()`.

---

## Logging

| Level | Sink |
|-------|------|
| Activity | Task file activity log |
| Runtime | `sessions/{session-id}.md` |
| Audit | `audit/AUDIT.log.md` |

---

## Out of Scope

- Feature 38 product APIs
- Message bus / shared memory
- Parallel agents on one task
- WorkPilot `src/` changes

---

## Tests

```bash
node --test docs/ai-team/runtime/__tests__/runtime.test.mjs docs/ai-team/runtime/__tests__/runtime-ops.test.mjs docs/ai-team/runtime/__tests__/runtime-hq.test.mjs
# or: npm run test:ai-company
# HQ entry: npm run ai-company:enter
```

---

## Version

| Field | Value |
|-------|--------|
| Phase | C4 + Stage 4 Beta Stabilization + Stage 5 Daily Ops |
| Updated | 2026-07-21 |
