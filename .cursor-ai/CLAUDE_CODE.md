# Claude Code — Execution Bridge

> After CEO approves the **proposal**, implementation is executed by Claude Code / Cursor coding agent.  
> Employees do **not** pretend they already shipped code.

---

## Purpose

Connect Internal AI Company decisions to real repository changes.

```
CEO approves proposal
  → Orchestrator sets task IN_PROGRESS
  → Claude Code / Cursor Agent implements
  → Engineers verify against plan
  → QA → Security → Reviewer
  → CEO ship approval → DONE
```

---

## Preconditions (all required)

- [ ] Task exists on Task Board
- [ ] Discussion Record + Final Proposal present
- [ ] CEO phrase recorded (e.g. `Approve TASK-… proposal only`)
- [ ] Status moved `WAITING_CEO` → `IN_PROGRESS`
- [ ] Handoff file updated with execution packet
- [ ] Owner role = Backend and/or Frontend

---

## Execution packet (paste into Claude Code / Agent)

Orchestrator prepares this block in the task + handoff:

```markdown
## Claude Code Execution Packet

| Field | Value |
|-------|--------|
| **Task** | TASK-YYYY-MM-DD-NNN |
| **CEO approval** | phrase + timestamp |
| **Goal** | … |
| **Allowed paths** | list dirs/files |
| **Forbidden** | secrets, unrelated refactors, scope expansion |
| **Acceptance criteria** | copy from task |
| **Test commands** | e.g. related tests / lint / tsc |
| **Done means** | AC checked + activity log updated |

### Implement exactly

1. …
2. …
3. …

### Do not

- Redesign systems outside allowed paths
- Skip QA/Security/Reviewer gates after coding
- Mark DONE (CEO only via Orchestrator after gates)
```

---

## How to run (CEO / Orchestrator)

1. Open Cursor Agent / Claude Code on this repo.
2. Paste the **Execution Packet**.
3. Require the agent to follow `.cursor-ai/Backend.md` / `Frontend.md` constraints.
4. When coding finishes, Orchestrator:
   - Appends activity `EXECUTED` with summary + files touched
   - Sets owner → QA, status → `QA`
   - Writes handoff

---

## Post-execution gates (never skip)

| Step | Owner | Status |
|------|-------|--------|
| Implementation review vs plan | Backend/Frontend + Reviewer notes | still `IN_PROGRESS` or → `QA` |
| Test validation | QA | `QA` |
| Security validation | Security | `SECURITY` |
| Code review | Reviewer | `REVIEW` |
| Ship approval | CEO | `WAITING_CEO` → `DONE` |

---

## Audit

Every execution must add a line to `docs/ai-team/runtime/audit/AUDIT.log.md`:

`EXECUTE_START` → `EXECUTE_FINISH` (or `EXECUTE_FAILED`)

---

## Forbidden

- Starting Claude Code without CEO proposal approval
- Expanding scope inside the coding session
- Treating coding agent output as DONE without QA/Security/Reviewer/CEO
