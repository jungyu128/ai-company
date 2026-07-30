# AI Company Daily Operations (Stage 5)

Builder Runtime artifacts for day-to-day company operations. **Not Feature 38.** Lives under Builder Runtime only (`.cursor-ai` + `docs/ai-team`).

Validated by `runtime-ops.mjs`, `runtime-hq.mjs`, and session hooks on `createRuntimeSession`.

## Enter AI Company (HQ)

| Command | Purpose |
|---|---|
| **Web HQ (primary)** | `/builder/hq` — live Builder Runtime dashboard |
| Say `Enter AI Company` in chat | Orchestrator opens / summarizes HQ |
| Cursor command `/enter-ai-company` | Same entry |
| `npm run ai-company:enter` | Regenerates `ops/HQ.md` |

HQ shows Builder Runtime state only — **never** WorkPilot users, Gmail, Calendar, CRM, or customers.

**CEO Advisor** (top of `/builder/hq`): synthesizes sprint, decisions, audit, releases, health, and approvals into an executive briefing (since last visit → attention → why → action → outcome → risks).

## Artifacts

| Artifact | Path | Purpose |
|---|---|---|
| **HQ dashboard** | `HQ.md` | CEO entry — what the company is doing now |
| Daily CEO briefing | `briefings/YYYY-MM-DD.md` | Morning status for James |
| Sprint plan | `sprints/SPRINT-NNN.md` | Capacity + committed tasks |
| Decision memory | `DECISION_MEMORY.md` + `decisions/*.md` | Company decisions that persist |
| Improvement proposals | `IMPROVEMENT_BACKLOG.md` | Auto + manual ops improvements |
| Weekly engineering report | `reports/` | Ship / blockers / debt / health |
| Release checklist | `RELEASE_CHECKLIST.md` | Pre-ship gate |
| Technical debt | `TECH_DEBT.md` | Tracked debt with severity |
| Releases | `releases/REL-*.md` | Release notes history |

## Integration with Builder Runtime

| Ops action | Runtime API |
|---|---|
| **Enter HQ** | `session.buildAiCompanyHq` / `npm run ai-company:enter` / **web `/builder/hq`** |
| Build daily briefing | `session.buildDailyCeoBriefing(input)` |
| Validate sprint plan | `session.validateSprintPlan(plan)` |
| Validate decision | `session.validateDecisionMemory(entry)` |
| Propose improvements | `session.proposeImprovements(signals)` |
| Weekly report | `session.buildWeeklyEngineeringReport(input)` |
| Release checklist | `session.validateReleaseChecklist(checklist)` |
| Tech debt | `session.validateTechDebtItem(item)` + `prioritizeTechDebt` |

## Rules

1. Ops never invent product features — they organize Builder Runtime work.
2. CEO remains sole approver for `WAITING_CEO`.
3. Preserve Stage 4 lifecycle. No Stage 6. No workflow redesign beyond HQ entry display.
