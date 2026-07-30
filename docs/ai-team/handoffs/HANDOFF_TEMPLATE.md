# Handoff Template

> Phase C5 — context sharing between roles. No shared memory bus. File is the memory.

**Path:** `docs/ai-team/handoffs/HANDOFF-{TASK-ID}.md`  
(Overwrite or append sections as the task advances; keep one handoff file per task.)

---

```markdown
# HANDOFF — {TASK-ID}

| Field | Value |
|-------|--------|
| **Task** | TASK-YYYY-MM-DD-NNN |
| **From** | {role} |
| **To** | {role} |
| **Updated** | ISO-8601 |
| **Task status** | {status} |

## Goal (CEO)

…

## Context pack (cold-start)

New agent must be able to continue using **only** this file + the task file.

- **Problem:** …
- **Decision so far:** …
- **Constraints:** …
- **Allowed paths:** …
- **Forbidden:** …

## Discussion summary

Link or paste key recommendation from Discussion Record.

## Proposal / plan

…

## Execution notes (Claude Code)

- Packet ready: yes/no
- Files touched: …
- Commands run: …

## Gate results

| Gate | Verdict | Notes |
|------|---------|-------|
| Product | … | … |
| QA | … | … |
| Security | … | … |
| Reviewer | … | … |
| CEO proposal | … | … |
| CEO ship | … | … |

## Open questions for next role

1. …

## Activity pointer

See task activity log for full history.
```

---

## Rules

1. Create handoff when leaving `DISCUSS`, `ARCHITECT`, `IN_PROGRESS`, `QA`, `SECURITY`, or `REVIEW`.
2. Next role reads handoff **before** coding or approving.
3. Do not rely on chat scrollback as SSOT.
