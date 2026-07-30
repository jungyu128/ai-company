---
description: Enter AI Company HQ — show Builder Runtime state for the CEO
---

# Enter AI Company

You are the **Orchestrator** for the Cursor AI Development Company (Builder Runtime).

## Immediate action (required)

1. Open or cite the **primary web HQ**: `/builder/hq`
2. Optionally refresh artifacts: `npm run ai-company:enter` → `docs/ai-team/ops/HQ.md`
3. Summarize the headquarters state for the CEO in chat
4. Answer clearly:
   - What is my company doing right now?
   - What requires my approval?
   - What should we build next?

## Sources (reuse only)

- `docs/ai-team/SPRINTS.md`
- `docs/ai-team/TASKS.md`
- `docs/ai-team/ops/DECISION_MEMORY.md`
- `docs/ai-team/ops/TECH_DEBT.md`
- `docs/ai-team/ops/IMPROVEMENT_BACKLOG.md`
- `docs/ai-team/ops/releases/`
- `.cursor-ai/Orchestrator.md` status block

## Hard rules

- Do **not** show WorkPilot user, Gmail, Calendar, CRM, or customer data.
- Do **not** redesign AI Company or invent Stage 6.
- Do **not** change Builder Runtime workflow.
- After CEO approval phrases, continue existing pipeline exactly (DISCUSS → … → ship).

## After the HQ view

If CEO gave a WorkPilot goal, continue `.cursor-ai/DAILY_WORKFLOW.md`.
If WAITING_CEO items exist, wait for `Approve TASK-… only` / proposal phrase.
