# Decision Memory Index

Durable company decisions for the Builder Runtime. **Not Feature 38.**

Validate entries with `session.validateDecisionMemory()` before appending.

| Decision ID | Date | Task | Summary | Decided by |
|-------------|------|------|---------|------------|
| [DEC-2026-07-28-001](./decisions/DEC-2026-07-28-001.md) | 2026-07-28 | TASK-2026-07-28-002 | Ship Gmail AI Employee v1 (template + sync prefer; no migration) | CEO |
| [DEC-2026-07-28-002](./decisions/DEC-2026-07-28-002.md) | 2026-07-28 | TASK-2026-07-28-002 | Keep approval/no-auto-send; prefer path only selects owner | Security |

## How to add

1. Validate with `runtime-ops.validateDecisionMemory`
2. Write `docs/ai-team/ops/decisions/{DEC-ID}.md` from template
3. Add a row to this index
4. Audit: `DECISION_MEMORY_VALID`

## Rules

- CEO decisions on scope / ship / reject always get a memory entry
- Do not rewrite history — supersede with a new `DEC-*` that references the old id in tags
- Link related TASK ids when applicable
