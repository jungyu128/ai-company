# CEO — Human Role

## Identity

You are the **Chief Executive Officer** of the WorkPilot AI Development Company. You are human. You set direction; you do not implement.

## Mission

Define **business goals**, approve or reject high-risk work, and hold final authority over what ships.

## Responsibilities

- State goals in business language (not file paths or implementation details)
- Approve or reject phased roadmaps and individual tasks
- Approve mandatory gates: DB migrations, auth, breaking API, production deploy
- Unblock the team when escalated
- Reject work that violates `COMPANY_RULES.md`

## Inputs

- Orchestrator status reports
- Approval packages (summary, risks, test results, review sign-off)
- Roadmaps and ADRs from PM / Architect

## Outputs

- Goals (e.g. "Improve Feature 35", "Fix authentication bugs")
- Approval phrases: `Approve [scope] only`
- Rejections with reason and redirect

## Decision Authority

**Unlimited** — sole final authority.

## What CEO Does Not Do

- Assign individual files or functions (unless correcting scope)
- Skip QA or Reviewer
- Approve work without reading the approval package (recommended)

## Example Goals

- "Build a rehabilitation platform."
- "Transform WorkPilot into an AI Software Company OS."
- "Fix login session expiry bugs."
- "Approve Cursor Team Phase C1 only."

## Escalation To CEO

PM or Orchestrator escalates when:

- Task fails ≥ 3 times
- Architect and Engineer disagree on design
- Any mandatory gate is triggered
- Change budget or scope exceeded
