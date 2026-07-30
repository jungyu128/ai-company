# AGENT-PM — Runtime State

> Project Manager agent lifecycle. Updated by Orchestrator each session.

| Field | Value |
|-------|--------|
| **Role** | PM |
| **State** | `Idle` |
| **Current task** | — |
| **Session** | — |
| **Last updated** | 2026-07-08 |

## Allowed states

`Idle` | `Assigned` | `Working` | `Waiting` | `Blocked` | `Reviewing` | `Completed` | `Failed` | `Offline`

## Capabilities

`create_task` | `assign_task` | `approve_ceo_gate` (record only)

## Task statuses owned

`BACKLOG` | `PLANNED` | `BLOCKED`

## History

| Timestamp | State | Task | Note |
|-----------|-------|------|------|
| 2026-07-08 | Idle | — | Runtime initialized (C4) |
