# Technical Debt Register

Track builder / WorkPilot engineering debt. Surfaces in daily briefing + weekly report via `validateTechDebtItem` / `prioritizeTechDebt`.

| Debt ID | Severity | Status | Title | Related task | Owner |
|---------|----------|--------|-------|--------------|-------|
| — | — | — | _No open debt_ | — | — |

## Severity

| Level | Meaning |
|-------|---------|
| P0 | Blocks ship / correctness |
| P1 | High risk; plan this sprint |
| P2 | Should fix soon |
| P3 | Nice to clean |

## Status

`OPEN` | `PLANNED` | `IN_PROGRESS` | `DONE` | `WONT_FIX`

## Template row

```markdown
| DEBT-YYYY-MM-DD-NNN | P1 | OPEN | Short title | TASK-… | Backend |
```

Validate before adding: `session.validateTechDebtItem({ debtId, title, severity, status, impact, relatedTaskId, ownerRole })`.
