# Task Template

> **Save completed tasks to:** `docs/ai-team/tasks/{TASK-ID}.md`  
> **Update index:** `docs/ai-team/TASKS.md`  
> **Protocol:** `docs/ai-team/TASK_BOARD.md`

Copy this block when PM creates a new task.

---

## Task ID

`TASK-YYYY-MM-DD-NNN` (e.g. `TASK-2026-07-08-001`)

## Title

_One line summary_

## CEO Goal Link

_Original business goal or approval phrase_

## Status

`BACKLOG | PLANNED | ARCHITECT | IN_PROGRESS | QA | REVIEW | WAITING_CEO | BLOCKED | DONE | CANCELLED`

## Sprint

`SPRINT-NNN` (see `docs/ai-team/SPRINTS.md`) or `—`

## Milestone

`MILE-XXX` (see `docs/ai-team/MILESTONES.md`) or `—`

## Dependencies

- _Task IDs (e.g. TASK-2026-07-08-001) or "None"_

## Blocked

- [ ] No
- [ ] Yes — Reason: _ | Since: _ | Unblock: _

## Priority

`P0 | P1 | P2 | P3`

## Assigned Role

`Architect | Backend | Frontend | QA | Reviewer | DevOps`

## Dependencies

- _Task IDs or external blockers_

## Acceptance Criteria

- [ ] _Criterion 1_
- [ ] _Criterion 2_
- [ ] _Criterion 3_

## Architect Sign-off

- [ ] Not required (trivial)
- [ ] Required — Status: `PENDING | APPROVED | REJECTED`
- ADR link: _

## CEO Gates

- [ ] None
- [ ] DB migration
- [ ] Auth change
- [ ] Breaking API
- [ ] Production deploy

## Scope

**IN:** _files/areas allowed_

**OUT:** _explicit exclusions_

## Change Budget

- Read ≤ 10 files
- Modify ≤ 5 files
- New files: _

## Notes

_Context for engineers_

## Handoff Links

- Architect: _
- Engineer: _
- QA: `TEST_TEMPLATE` _
- Review: `REVIEW_TEMPLATE` _

## Session Log → Activity Log

Append every action to the task file (required):

| Timestamp | Actor | Action | Details |
|-----------|-------|--------|---------|
| | | CREATED / ASSIGNED / STATUS / HANDOFF / … | |

---

## Definition of Done

- [ ] AC met
- [ ] Tests reported
- [ ] Reviewer APPROVED
- [ ] CEO approved (if gates)
- [ ] Handoff updated
