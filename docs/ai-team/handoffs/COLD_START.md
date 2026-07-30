# Cold-Start Protocol (Phase C5)

> How an AI employee starts work with **zero** prior chat memory.

---

## Load order (mandatory)

1. `.cursor-ai/COMPANY_RULES.md` (constitution)
2. Role file: `.cursor-ai/{Role}.md`
3. `docs/ai-team/tasks/{TASK-ID}.md`
4. `docs/ai-team/handoffs/HANDOFF-{TASK-ID}.md` (if missing → ask Orchestrator to create)
5. `docs/ai-team/runtime/agents/AGENT-{Role}.md`
6. Relevant templates (TASK / TEST / REVIEW)

Do **not** invent prior decisions. If handoff is incomplete → status `BLOCKED` with reason.

---

## Minimum context pack

Handoff must answer:

| Question | Present? |
|----------|----------|
| What is the CEO goal? | |
| What was decided? | |
| What is out of scope? | |
| What files may change? | |
| What gate am I? | |
| What is the next handoff target? | |

If any row is empty for an `IN_PROGRESS`+ task → Orchestrator repairs handoff before dispatch.

---

## Integration with Task Board

Activity type: `HANDOFF`

```
| timestamp | {FromRole} | HANDOFF | to={ToRole}; file=handoffs/HANDOFF-{id}.md |
```

Update `TASKS.md` owner + status in the same turn.

---

## Out of scope (still)

- Shared vector memory product
- Message bus / multi-agent sockets
- Parallel agents on one task
