# Release Checklist (Builder)

Pre-ship gate for Builder Runtime tasks. Validate with `session.validateReleaseChecklist`.

**Not** Feature 38. Does not invent production-ready claims — evidence only.

## Required checks (all must be `true`)

| Key | Meaning |
|-----|---------|
| `taskDoneOrWaitingCeo` | Task is DONE or waiting final CEO ship |
| `qaPass` | QA gate passed |
| `securityPass` | Security gate passed |
| `reviewerApproved` | Reviewer approved |
| `ceoApprovalRecorded` | CEO ship phrase recorded |
| `handoffUpdated` | Handoff / cold-start updated |
| `testsGreen` | Relevant tests green |
| `noOpenP0Debt` | No open P0 tech debt blocking ship |
| `auditLogged` | Audit log updated |

## Per-release copies

See `docs/ai-team/ops/releases/` — e.g. `REL-TASK-2026-07-28-002.md` and checklist notes in that release folder / task.

## Usage

```javascript
session.validateReleaseChecklist({
  taskId: "TASK-2026-07-28-002",
  taskDoneOrWaitingCeo: true,
  qaPass: true,
  securityPass: true,
  reviewerApproved: true,
  ceoApprovalRecorded: false, // set true after CEO ship phrase
  handoffUpdated: true,
  testsGreen: true,
  noOpenP0Debt: true,
  auditLogged: true,
});
```
