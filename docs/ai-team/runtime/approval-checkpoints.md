# Approval Checkpoints (Phase C4)

Runtime enforcement via `requiresCeoApproval()` and `canMarkDone()`.

---

## Checkpoint types

| ID | Name | Trigger | Approver | Task status |
|----|------|---------|----------|-------------|
| **A1** | Scope / phase | New feature or phase start | CEO phrase | PLANNED |
| **A2** | CEO gate | `dbMigration`, `authChange`, `breakingApi`, `prodDeploy`, `ceoGate` on task | CEO | WAITING_CEO |
| **A3** | Final deliverable | Reviewer APPROVED | CEO (if gate or policy) | WAITING_CEO → DONE |
| **A4** | Override | CEO direct command | CEO | any |

---

## Bypass prevention

Runtime / Orchestrator **must not**:

- Call `canMarkDone()` success without QA PASS + Reviewer APPROVED
- Set task `DONE` while `WAITING_CEO` without `CEO_APPROVAL` activity
- Clear `ceo_gate` flags without audit entry

---

## CEO approval package (on task file)

```markdown
## CEO Approval Package
- Summary:
- QA: PASS — link
- Review: APPROVED — link
- Gates: [ ]
- Recommendation: APPROVE | REJECT
```

---

## Activity log actions

- `CEO_APPROVAL | APPROVED`
- `CEO_APPROVAL | REJECTED`
- `CEO_OVERRIDE`

---

## Agent behavior during approval

| Checkpoint | Agent states |
|------------|--------------|
| A2, A3 pending | Relevant agents → `Waiting` |
| CEO APPROVED | PM sets DONE; agents → `Completed` → `Idle` |
| CEO REJECTED | PM reopens task; assignee → `Assigned` |

---

## Task metadata flags

On task file **Metadata** section:

```markdown
| **ceo_gate** | No |
| **db_migration** | No |
| **auth_change** | No |
| **breaking_api** | No |
| **prod_deploy** | No |
```

Set `ceo_gate: Yes` when any flag is Yes.
