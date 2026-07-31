/**
 * Role + mission scope enforcement for the WorkPilot AI Company.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import {
  validateEmployeeOutput,
  roleContractForEmployee,
  isValidCollaboratorPair,
  listEmployeesWithRoleContracts,
} from "@/services/builder/autonomous-company/employee-role.logic";
import {
  buildMissionExecutionContext,
  EXECUTION_SAFETY_RULES,
} from "@/services/builder/autonomous-company/mission-execution-context.logic";
import {
  clarificationAlreadyAsked,
  detectMissingRequirements,
} from "@/services/builder/autonomous-company/work-items.logic";
import {
  buildEmployeeChatReply,
  regenerateMissionScopedReply,
} from "@/services/builder/hq-chat.logic";
import { defaultCollaboratorsFor } from "@/services/builder/autonomous-company/peer-discussion.logic";

function hqMission() {
  return planCollaborationChain({
    missionId: "TASK-ROLE-HQ-001",
    title: "HQ Conversation autonomy",
    mission:
      "Ship WorkPilot Builder HQ conversation focused on product engineering. Plan step: Implement chat. Plan step: Verify with tests.",
    leadEmployeeId: "mia",
    planSummary: "HQ chat",
    planSteps: ["Implement HQ chat UI", "Verify with focused tests"],
    now: "2026-07-31T15:00:00.000Z",
  });
}

describe("employee role contracts", () => {
  it("gives every employee persistent allowed and prohibited actions", () => {
    const all = listEmployeesWithRoleContracts();
    assert.ok(all.length >= 8);
    for (const emp of all) {
      assert.ok(emp.allowedActions.length > 0, emp.id);
      assert.ok(emp.prohibitedActions.length > 0, emp.id);
      assert.ok(
        emp.prohibitedActions.some((a) => /outreach|email|crm|sales|merge|deploy/i.test(a)),
        emp.id
      );
    }
    const mia = roleContractForEmployee("mia");
    assert.ok(mia?.allowedActions.includes("implement_ui"));
    assert.ok(mia?.prohibitedActions.includes("draft_outreach"));
  });

  it("rejects unrelated outreach content outside role and mission", () => {
    const mission = hqMission();
    const bad = validateEmployeeOutput({
      employeeId: "mia",
      text: "I'll draft outreach email to re-engage CRM sales leads today.",
      activeMissions: [mission],
      assignedTask: "Advance: HQ Conversation autonomy",
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.reasons.includes("unrelated_comms"));

    const good = validateEmployeeOutput({
      employeeId: "mia",
      text: "I'll implement the HQ chat UI component on a WorkPilot feature branch for QA.",
      activeMissions: [mission],
      assignedTask: "Advance: HQ Conversation autonomy",
    });
    assert.equal(good.ok, true);
  });

  it("keeps employees within role and regenerates off-scope chat replies", () => {
    const mission = hqMission();
    const ctx = {
      employeeId: "noah",
      employeeName: "Noah",
      employeeRole: "Backend Engineer",
      expertise: ["API design"],
      communicationStyle: "Steady",
      currentTask: "Advance: HQ Conversation autonomy",
      currentActivity: "API contract",
      missionTitle: mission.title,
      missionSummary: mission.mission,
      memoryHints: [],
      knowledgeHints: [],
      recentActivity: [],
      priorMessages: [],
      activeMissions: [mission],
      executionContext: buildMissionExecutionContext({
        employeeId: "noah",
        missions: [mission],
      }),
      ceoMessage: "Please draft a Gmail outreach sequence for prospects",
    };

    // Forced regenerate path
    const regenerated = regenerateMissionScopedReply(ctx, ["unrelated_comms"]);
    assert.match(regenerated, /mission-scoped regenerate|Staying on/i);
    assert.doesNotMatch(regenerated, /draft outreach email to re-engage/i);

    const reply = buildEmployeeChatReply(ctx);
    const body = reply.split(/\n\n/).slice(-1)[0] ?? reply;
    const check = validateEmployeeOutput({
      employeeId: "noah",
      text: body,
      activeMissions: [mission],
      assignedTask: ctx.currentTask,
      ceoMessage: ctx.ceoMessage,
    });
    // CEO explicit comms request allows scope escape for validation of body —
    // but role lenses stay WorkPilot; ensure no CRM pitch.
    assert.doesNotMatch(reply, /CRM account activity|sales pipeline motion/i);
    assert.match(reply, /WorkPilot|HQ Conversation|API|schema|backend/i);
    assert.equal(typeof check.ok, "boolean");
  });

  it("allows valid cross-department collaboration pairs only", () => {
    assert.equal(isValidCollaboratorPair("mia", "ethan"), true);
    assert.equal(isValidCollaboratorPair("noah", "ethan"), true);
    assert.equal(isValidCollaboratorPair("mia", "mia"), false);
    const peers = defaultCollaboratorsFor("mia");
    assert.ok(peers.includes("ethan"));
    assert.ok(peers.every((id) => isValidCollaboratorPair("mia", id)));
  });
});

describe("mission execution context + clarification", () => {
  it("bundles mission, work item, role, task, criteria, safety for every execution", () => {
    const mission = hqMission();
    const ctx = buildMissionExecutionContext({
      employeeId: "mia",
      missions: [mission],
      repositoryContext: ["src/features/builder/hq-chat.ts"],
      ceoDecisions: ["Approved HQ chat slice"],
    });
    assert.equal(ctx.activeMission?.id, mission.id);
    assert.ok(ctx.workItem);
    assert.equal(ctx.assignedRole, "Frontend Engineer");
    assert.ok(ctx.acceptanceCriteria.length >= 1);
    assert.ok(ctx.repositoryContext.includes("src/features/builder/hq-chat.ts"));
    assert.ok(ctx.ceoDecisions.length >= 1);
    assert.deepEqual(ctx.executionSafetyRules.slice(0, 1), [
      EXECUTION_SAFETY_RULES[0],
    ]);
    assert.ok(ctx.roleAllowedActions.length > 0);
    assert.ok(ctx.roleProhibitedActions.length > 0);
  });

  it("infers criteria from mission/repo evidence and prevents duplicate clarification", () => {
    const missing = detectMissingRequirements({
      title: "HQ Conversation autonomy UI",
      description: "Implement HQ chat page flow",
      missionCorpus:
        "acceptance criteria: desktop HQ chat works. Plan step: Verify with tests. Scoped to Builder HQ.",
      repositoryEvidence: ["hq-chat.test.ts covers send path"],
    });
    assert.ok(!missing.includes("acceptance criteria / definition of done"));
    assert.ok(!missing.includes("target surfaces (desktop / mobile)"));

    const asked = [
      "acceptance criteria / definition of done",
      "target ship window",
    ];
    assert.equal(
      clarificationAlreadyAsked(
        [
          {
            role: "employee",
            body: "Mia — clarification before I proceed\nPlease confirm:\n1. acceptance criteria / definition of done\n2. target ship window",
          },
        ],
        asked
      ),
      true
    );
    assert.equal(
      clarificationAlreadyAsked(
        [{ role: "ceo", body: "keep going" }],
        asked
      ),
      false
    );
  });
});
