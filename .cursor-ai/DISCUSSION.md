# DISCUSSION — Collaborative Reasoning Protocol

> Employees **discuss, challenge, and refine** before CEO sees a proposal.  
> This is not a single-model answer. It is structured multi-role deliberation.

---

## Goal

Raise decision quality above a solo chat by forcing disagreement, alternatives, and evidence onto the Task Board.

---

## When

Task status = `DISCUSS` (created after CEO goal → PM opens discussion).

---

## Participants (minimum)

| Role | Duty in discussion |
|------|--------------------|
| **Product** | User value, success metric, non-goals |
| **PM** | Scope, roadmap slice, risks to schedule |
| **Architect** | Feasibility, blast radius, options (2+) |
| **Backend / Frontend** | Implementation cost / constraints (plan only) |
| **QA** | Testability, failure modes |
| **Security** | Abuse cases, auth/tenant risks |
| **Orchestrator** | Facilitation; no silent consensus |

CEO does **not** join the debate until a proposal is ready — unless blocked.

---

## Round structure (mandatory)

Each discussion produces a **Discussion Record** in the task file:

### Round 1 — Frame
- Product restates the CEO goal as a user problem
- PM proposes IN / OUT scope (max 5 bullets)

### Round 2 — Challenge
Each role must add **at least one** of:
- Counter-argument
- Alternative approach
- Risk / blocker
- “What would make this fail?”

Silent agreement is invalid. If everyone agrees immediately, Orchestrator asks for a dissenting option.

### Round 3 — Converge
- Architect lists 2 options with tradeoffs
- Team picks a **recommended option** + why losers lost
- QA + Security attach proposal-phase notes (strategy / risks)

### Round 4 — CEO packet
PM writes **Final Proposal** (see template below) → status `WAITING_CEO`.

---

## Discussion Record template

```markdown
## Discussion Record

| Field | Value |
|-------|--------|
| **Task** | TASK-… |
| **Opened** | ISO time |
| **Facilitator** | Orchestrator |
| **Closed** | ISO time |

### Positions

| Role | Position | Challenge | Evidence |
|------|----------|-----------|----------|
| Product | … | … | … |
| PM | … | … | … |
| Architect | … | … | … |
| Backend | … | … | … |
| Frontend | … | … | … |
| QA | … | … | … |
| Security | … | … | … |

### Options considered

1. …
2. …

### Recommendation

- **Chosen:** …
- **Why:** …
- **Rejected:** … because …

### Open risks

- …
```

---

## Final Proposal (CEO packet)

```markdown
## Final Proposal (for CEO)

| Field | Value |
|-------|--------|
| **Goal** | … |
| **User outcome** | … |
| **Plan** | 3–7 steps |
| **Out of scope** | … |
| **Risks** | … |
| **QA strategy** | … |
| **Security notes** | … |
| **Ask** | `Approve TASK-… proposal only` |
```

---

## Rules

1. Discussion happens **on the Task Board** (activity + Discussion Record), not as private side chat.
2. No production code during `DISCUSS`.
3. Claude Code / implementation starts only after CEO proposal approval → `IN_PROGRESS`.
4. Handoff file required when leaving `DISCUSS` (`docs/ai-team/handoffs/`).
5. **Stage 4:** close discussion only after `validateDiscussionRecord()` passes (runtime) — silent unanimous agreement is invalid.
