/**
 * CEO Approval Center — employee-facing decisions over collaboration missions.
 */

import { applyApprovalDecision, type CollaborationMission } from "./collaboration.logic";
import { getCollaboration, listCollaborations, upsertCollaboration } from "./collaboration.store";
import { getEmployeeDefinition } from "./ai-company-employees";
import { isInternalAiCompanyEnabled } from "./internal-ai-company";
import { ensureMissionCommunications } from "./conversation.logic";
import { prepareExternalWorkForEmployee } from "./execution/execution.service";
import type { ExecutionRecord } from "./execution/types";
import { recordWorkspaceEvent } from "./workspace/collaboration-feed";
import type { WorkspaceHumanRole } from "./workspace/types";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";

export type ApprovalCenterItem = {
  id: string;
  title: string;
  mission: string;
  requestingEmployee: { id: string; name: string; role: string };
  collaborationChain: CollaborationMission["chain"];
  conversations: NonNullable<CollaborationMission["conversations"]>;
  planSummary: string;
  planSteps: string[];
  approvalStatus: CollaborationMission["approvalStatus"];
  ceoNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listApprovalCenter(
  repoRoot = process.cwd(),
  workspaceId = "default"
): ApprovalCenterItem[] {
  return listCollaborations(repoRoot, workspaceId)
    .filter(
      (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
    )
    .map(toApprovalItem);
}

export function listAllApprovalHistory(
  repoRoot = process.cwd(),
  workspaceId = "default"
): ApprovalCenterItem[] {
  return listCollaborations(repoRoot, workspaceId).map(toApprovalItem);
}

function toApprovalItem(m: CollaborationMission): ApprovalCenterItem {
  const mission = ensureMissionCommunications(m);
  const waiter =
    mission.chain.find((s) => s.status === "waiting_approval") ??
    mission.chain[mission.chain.length - 1] ??
    null;
  const emp = waiter
    ? getEmployeeDefinition(waiter.employeeId)
    : getEmployeeDefinition(mission.leadEmployeeId);

  return {
    id: mission.id,
    title: mission.title,
    mission: mission.mission,
    requestingEmployee: {
      id: emp?.id ?? mission.leadEmployeeId,
      name: emp?.name ?? "Employee",
      role: emp?.role ?? "AI Employee",
    },
    collaborationChain: mission.chain,
    conversations: mission.conversations ?? [],
    planSummary: mission.planSummary,
    planSteps: mission.planSteps,
    approvalStatus: mission.approvalStatus,
    ceoNote: mission.ceoNote,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  };
}

export async function decideApproval(input: {
  missionId: string;
  decision: "approve" | "reject" | "request_changes";
  note?: string | null;
  repoRoot?: string;
  workspaceId?: string;
  actor?: {
    userId: string;
    displayName: string;
    role: WorkspaceHumanRole;
  };
}): Promise<
  | { ok: true; item: ApprovalCenterItem; execution: ExecutionRecord | null }
  | { ok: false; code: string; message: string; status: number }
> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const existing = getCollaboration(input.missionId, root, workspaceId);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Approval item not found",
      status: 404,
    };
  }

  const updated = applyApprovalDecision(
    existing,
    input.decision,
    input.note?.trim() ? input.note.trim() : null
  );
  upsertCollaboration(updated, root, workspaceId);

  let execution: ExecutionRecord | null = null;
  if (input.decision === "approve") {
    const prepared = await prepareExternalWorkForEmployee({
      employeeId: updated.leadEmployeeId,
      missionId: updated.id,
      requestedAction: updated.title,
      params: {
        guidance: updated.mission,
        body: updated.mission,
        note: updated.mission,
        title: updated.title,
      },
      repoRoot: root,
      workspaceId,
    });
    if (prepared.ok && prepared.record) execution = prepared.record;
  }

  if (input.actor) {
    recordWorkspaceEvent({
      workspaceId,
      kind: "approval",
      summary: `${input.actor.displayName} ${input.decision.replace(/_/g, " ")} “${updated.title}”`,
      actorUserId: input.actor.userId,
      actorName: input.actor.displayName,
      actorRole: input.actor.role,
      relatedType: "mission",
      relatedId: updated.id,
      status: updated.approvalStatus,
      auditAction: `approval.${input.decision}`,
      notify:
        input.decision === "approve"
          ? undefined
          : {
              kind: "pending_approval",
              title: `Approval ${input.decision.replace(/_/g, " ")}`,
              body: updated.title,
            },
      repoRoot: root,
    });
  }

  return { ok: true, item: toApprovalItem(updated), execution };
}
