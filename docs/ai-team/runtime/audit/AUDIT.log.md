# Runtime Audit Log

> Append-only. One row per runtime action. Phase C4.

| Audit ID | Timestamp | Actor type | Actor ID | Task ID | Action | Before → After | Rationale |
|----------|-----------|------------|----------|---------|--------|----------------|-----------|
| AUD-INIT-0001 | 2026-07-08T12:40:00+09:00 | SYSTEM | runtime | — | RUNTIME_INITIALIZED | {} → { phase: "C4" } | Agent Runtime implementation complete |
| AUD-2026-07-28-0001 | 2026-07-28T00:20:00+09:00 | SYSTEM | runtime | TASK-2026-07-28-001 | RUNTIME_EXTENDED | { phase: "C4" } → { phase: "C5+", roles: ["Product","Security"], statuses: ["DISCUSS","SECURITY"] } | Daily AI Company pack |
| AUD-2026-07-28-0002 | 2026-07-28T12:40:00+09:00 | SYSTEM | runtime | — | STAGE4_STABILIZATION | {} → { availabilityLock: true, advanceCancelMutex: true, ceoTaskValidation: true, discussionValidation: true } | Builder runtime Stage 4 Beta Stabilization |
| AUD-2026-07-21-0003 | 2026-07-21T12:43:00+09:00 | SYSTEM | runtime | — | STAGE5_DAILY_OPS | {} → { briefing: true, sprint: true, decisionMemory: true, improvements: true, weeklyReport: true, releaseChecklist: true, techDebt: true } | Builder runtime Stage 5 Daily Operations |
| AUD-2026-07-28-0004 | 2026-07-28T15:30:00+09:00 | ORCHESTRATOR | runtime | TASK-2026-07-28-002 | EXECUTE_FINISH | { feature: "gmail_ai_v1" } → { status: "WAITING_CEO", releaseNotes: true, decisionMemory: ["DEC-2026-07-28-001","DEC-2026-07-28-002"] } | First WorkPilot feature via complete AI Company workflow |
| AUD-2026-07-28-0005 | 2026-07-28T14:45:00+09:00 | SYSTEM | runtime | — | HQ_ENTRY | {} → { command: "ai-company:enter", hq: "ops/HQ.md" } | AI Company Entry Experience — CEO headquarters dashboard |
| AUD-2026-07-28-0006 | 2026-07-28T15:05:00+09:00 | SYSTEM | runtime | — | HQ_WEB_V1 | {} → { route: "/builder/hq", api: "/api/builder/hq" } | AI Company Headquarters web dashboard v1 |
| AUD-2026-07-28-0007 | 2026-07-28T15:15:00+09:00 | SYSTEM | runtime | — | CEO_ADVISOR_V1 | {} → { module: "runtime-ceo-advisor.mjs", panel: "CeoAdvisorPanel" } | CEO Advisor executive briefing on HQ entry |
| AUD-2026-07-29-0001 | 2026-07-29T09:40:00+09:00 | SYSTEM | reconcile | TASK-2026-07-29-001 | CEO_MISSION_RECONCILED | {"indexed":false} → {"indexed":true,"sprint":"SPRINT-004"} | Reconcile orphan task detail into board — Build Calendar AI Employee v1. |

## Action types

`DISPATCH_APPROVED` | `DISPATCH_DENIED` | `AGENT_TRANSITION` | `AGENT_TRANSITION_DENIED` | `TASK_TRANSITION` | `TASK_TRANSITION_DENIED` | `CEO_APPROVAL` | `CEO_APPROVAL_DENIED` | `RUNTIME_INITIALIZED` | `RUNTIME_EXTENDED` | `STAGE4_STABILIZATION` | `STAGE5_DAILY_OPS` | `EXECUTE_START` | `EXECUTE_FINISH` | `HANDOFF` | `DISCUSSION` | `ADVANCE_LOCK_ACQUIRED` | `ADVANCE_LOCK_RELEASED` | `ADVANCE_APPROVED` | `ADVANCE_DENIED` | `CANCEL_APPROVED` | `CANCEL_DENIED` | `TASK_INPUT_VALID` | `TASK_INPUT_INVALID` | `DISCUSSION_VALID` | `DISCUSSION_INVALID` | `DAILY_BRIEFING_BUILT` | `DAILY_BRIEFING_DENIED` | `SPRINT_PLAN_VALID` | `SPRINT_PLAN_INVALID` | `DECISION_MEMORY_VALID` | `DECISION_MEMORY_INVALID` | `IMPROVEMENTS_PROPOSED` | `IMPROVEMENTS_DENIED` | `WEEKLY_REPORT_BUILT` | `WEEKLY_REPORT_DENIED` | `RELEASE_CHECKLIST_VALID` | `RELEASE_CHECKLIST_INVALID` | `TECH_DEBT_VALID` | `TECH_DEBT_INVALID`

## Format helper

Use `formatAuditLine()` from `lib/runtime-core.mjs` for consistent rows.
