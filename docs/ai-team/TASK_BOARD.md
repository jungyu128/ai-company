# AI Development Team — Task Board Protocol

> **Single source of truth** for all engineering work.  
> Phase C2 — file-based task board (no autonomous runtime, no message bus).

---

## Authority

| Rule | Detail |
|------|--------|
| **SSOT** | `docs/ai-team/TASKS.md` + `docs/ai-team/tasks/{TASK-ID}.md` |
| **Communication** | All work requests, handoffs, and status changes go through the Task Board |
| **Forbidden** | Direct AI-to-AI implementation requests outside a Task Board record |
| **Owner** | **Project Manager AI** maintains index; assignee updates task file activity log |

---

## File Layout

```
docs/ai-team/
├── TASK_BOARD.md      ← This protocol
├── TASKS.md           ← Dashboard index (always update when task changes)
├── SPRINTS.md         ← Sprint definitions
├── MILESTONES.md      ← Milestone definitions
├── handoffs/          ← Phase C5 context packs (one per task)
├── runtime/           ← Agent Runtime (Phase C4+)
│   ├── RUNTIME.md
│   ├── agents/AGENT-{ROLE}.md
│   ├── audit/AUDIT.log.md
│   └── sessions/
└── tasks/
    └── TASK-YYYY-MM-DD-NNN.md   ← One file per task (detail + history)
```

---

## Task ID Format

`TASK-YYYY-MM-DD-NNN`

- Date = creation date (UTC or local, be consistent)
- NNN = sequential 001, 002… per day

Example: `TASK-2026-07-08-001`

---

## Status Values

| Status | Meaning | Typical owner |
|--------|---------|---------------|
| `BACKLOG` | Identified, not planned | PM |
| `DISCUSS` | Multi-role deliberation | Product / PM |
| `PLANNED` | Roadmap scoped | PM |
| `ARCHITECT` | Design / ADR in progress | Architect |
| `IN_PROGRESS` | Claude Code / engineering implementation | Backend / Frontend |
| `QA` | Testing / validation | QA |
| `SECURITY` | Security validation | Security |
| `REVIEW` | Code review | Reviewer |
| `WAITING_CEO` | Proposal **or** ship approval | CEO |
| `BLOCKED` | Cannot proceed | PM unblocks |
| `DONE` | Complete | — |
| `CANCELLED` | Won't do | CEO / PM |

### Allowed transitions

```
BACKLOG → DISCUSS → PLANNED → ARCHITECT → WAITING_CEO → IN_PROGRESS → QA → SECURITY → REVIEW → WAITING_CEO → DONE
Any → BLOCKED (with reason)
BLOCKED → previous status (when unblocked)
Any → CANCELLED (CEO or PM with CEO note)
REVIEW → IN_PROGRESS (CHANGES_REQUESTED)
QA / SECURITY → IN_PROGRESS (FAIL)
```

### Activity types

| Type | When |
|------|------|
| `CREATED` | Task opened |
| `STATUS` | Status change |
| `HANDOFF` | Role context pack written (`docs/ai-team/handoffs/`) |
| `DISCUSSION` | Discussion Record updated |
| `PROPOSAL` | Final Proposal ready for CEO |
| `EXECUTED` | Claude Code / coding agent finished a slice |
| `GATE` | QA / Security / Reviewer verdict |
| `CEO` | Approval phrase recorded |

---

## Priority

| Value | Meaning |
|-------|---------|
| `P0` | Critical / CEO flagged |
| `P1` | Current sprint commitment |
| `P2` | Normal backlog |
| `P3` | Nice to have |

---

## Ownership

| Field | Values |
|-------|--------|
| **Owner role** | `PM`, `Architect`, `Backend`, `Frontend`, `QA`, `Reviewer`, `DevOps`, `CEO` |
| **Owner agent** | Optional display name (e.g. "Backend AI") |

Only the **current owner role** may move status forward unless PM reassigns.

---

## Dependencies

- Field: `depends_on: [TASK-ID, ...]`
- A task cannot leave `PLANNED` until all dependencies are `DONE` (or `CANCELLED` with PM note).
- PM validates dependency graph; no circular deps.

---

## Blocked State

Set `status: BLOCKED` and fill:

```markdown
## Blocked

- **Reason:** _
- **Since:** YYYY-MM-DD
- **Blocked by:** _ (task id, person, or external)
- **Unblock action:** _
```

---

## Sprint Assignment

- Sprint IDs defined in `SPRINTS.md` (e.g. `SPRINT-001`)
- Each task has `sprint: SPRINT-xxx` or `—` for backlog
- PM assigns at planning time

---

## Milestone Assignment

- Milestone IDs in `MILESTONES.md` (e.g. `MILE-CURSOR-TEAM`)
- Each task links `milestone: MILE-xxx`
- Milestone completes when all linked tasks are `DONE` or `CANCELLED`

---

## Activity Log (required)

Every status change, comment, handoff, or assignment **must** append to the task file:

```markdown
| Timestamp | Actor | Action | Details |
|-----------|-------|--------|---------|
| 2026-07-08T12:00 | PM | CREATED | Task from CEO goal |
| 2026-07-08T12:30 | Architect | STATUS → ARCHITECT | ADR started |
```

**Actions:** `CREATED`, `ASSIGNED`, `STATUS`, `COMMENT`, `DEPENDENCY`, `BLOCKED`, `UNBLOCKED`, `HANDOFF`, `QA`, `REVIEW`, `CEO_APPROVAL`, `DONE`

---

## Operations

### Create task (PM)

1. Allocate `TASK-ID`
2. Copy structure from `.cursor-ai/TASK_TEMPLATE.md` into `tasks/{TASK-ID}.md`
3. Add row to `TASKS.md` index table
4. Log `CREATED` in activity log

### Assign task (PM)

1. Set `owner_role` and `status: PLANNED` or next appropriate status
2. Log `ASSIGNED` with role and AC summary
3. Update `TASKS.md`

### Claim work (Assignee)

1. Read full task file
2. Log `COMMENT` or `STATUS` when starting
3. Do **not** accept work mentioned only in chat — require task link

### Handoff (Any role → next role)

1. Append activity: `HANDOFF | to Reviewer | QA PASS report link`
2. Update `owner_role` and `status`
3. Update `TASKS.md`
4. Optional: attach `TEST_TEMPLATE` / `REVIEW_TEMPLATE` content in task file under **Artifacts**

### Complete (PM or Orchestrator after CEO approval)

1. `status: DONE`
2. Log `DONE` with summary
3. Update `TASKS.md` and check milestone progress in `MILESTONES.md`

---

## Dashboard Sync Rule

**Whenever a task file changes, update `TASKS.md` in the same session.**

Index columns: ID | Title | Owner | Priority | Status | Sprint | Milestone | Blocked | Depends | Updated

---

## CEO Interaction

- CEO creates goals in chat; **PM creates tasks** on the board
- CEO approval tasks use `status: WAITING_CEO`
- CEO responds with `Approve TASK-xxx only` → PM logs `CEO_APPROVAL` and advances status

---

## Agent Runtime (Phase C4+)

| Rule | Detail |
|------|--------|
| **Protocol** | `docs/ai-team/runtime/RUNTIME.md` |
| **Orchestrator** | `.cursor-ai/Orchestrator.md` |
| **Agent state** | `runtime/agents/AGENT-{ROLE}.md` — one task at a time |
| **Audit** | Append to `runtime/audit/AUDIT.log.md` on dispatch/transition |
| **Validation** | `runtime/lib/runtime-core.mjs` — dispatch + approval rules |

Orchestrator must run dispatch checklist before role work. No autonomous or parallel agent execution in C4.

---

## Out of Scope (Phase C2)

- Autonomous agents
- Message bus
- Shared memory system
- AI runtime / queue workers
- WorkPilot product APIs

---

## Version

| Field | Value |
|-------|--------|
| Phase | C2 Task Board + C4 Agent Runtime |
| Approved by | CEO |
