/**
 * Proactive intelligence orchestration for the AI Company HQ.
 */

import { listApprovalCenter } from "./approval.service";
import { listCollaborations } from "./collaboration.store";
import { formatHqDateTimeDisplay } from "./format-hq-display";
import { isInternalAiCompanyEnabled } from "./internal-ai-company";
import { getEmployeeDefinition } from "./ai-company-employees";
import { getCeoBriefingV2 } from "./operating-system-v2";
import {
  applyRecommendationDecision,
  buildExecutiveBrief,
  buildPriorityAlerts,
  buildRecommendationsFromDiscussions,
  computeCompanyHealth,
  detectProactiveSignals,
  type CeoRecommendationAction,
  type EmployeeRecommendation,
  type ExecutiveBrief,
  type PriorityAlert,
  type CompanyHealth,
  type ProactiveSignal,
} from "./proactive.logic";
import { ensureRecommendationDecisionPackage } from "./recommendation-intelligence.logic";
import {
  getProactiveRecommendation,
  listProactiveRecommendations,
  listProactiveSignals,
  saveProactiveScan,
  upsertProactiveRecommendation,
} from "./proactive.store";
import type { CompanyDashboardMetrics } from "./conversation.logic";
import { prepareExternalWorkForEmployee } from "./execution/execution.service";
import type { ExecutionRecord } from "./execution/types";

export function scanProactiveIntelligence(options?: {
  repoRoot?: string;
  now?: string;
  workspaceId?: string;
}): {
  signals: ProactiveSignal[];
  recommendations: EmployeeRecommendation[];
} {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const now = options?.now ?? new Date().toISOString();
  const missions = listCollaborations(root, workspaceId);
  const pendingApprovals = listApprovalCenter(root, workspaceId);
  const signals = detectProactiveSignals({ missions, pendingApprovals, now });
  const drafted = buildRecommendationsFromDiscussions(signals, now);

  const saved = saveProactiveScan({
    signals,
    recommendations: drafted,
    scannedAt: now,
    repoRoot: root,
    workspaceId,
  });

  return {
    signals: saved.signals,
    recommendations: saved.recommendations,
  };
}

export function getProactiveDashboardSlice(options?: {
  repoRoot?: string;
  workspaceId?: string;
  metrics: CompanyDashboardMetrics;
  generatedAtDisplay: string;
}): {
  executiveBrief: ExecutiveBrief;
  recommendations: EmployeeRecommendation[];
  priorityAlerts: PriorityAlert[];
  risks: string[];
  opportunities: string[];
  companyHealth: CompanyHealth;
  signals: ProactiveSignal[];
} {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  // Refresh detections on read so the company stays proactive.
  scanProactiveIntelligence({ repoRoot: root, workspaceId });
  const recommendations = listProactiveRecommendations(root, workspaceId).map(
    (r) => ensureRecommendationDecisionPackage(r) as EmployeeRecommendation
  );
  const signals = listProactiveSignals(root, workspaceId);
  const pendingApprovals = listApprovalCenter(root, workspaceId);
  const baseBrief = buildExecutiveBrief({
    recommendations,
    pendingApprovals,
    generatedAtDisplay: options?.generatedAtDisplay ?? formatHqDateTimeDisplay(new Date().toISOString()),
  });
  let executiveBrief = baseBrief;
  try {
    const opsBrief = getCeoBriefingV2({
      repoRoot: root,
      workspaceId,
    });
    executiveBrief = {
      ...baseBrief,
      headline: opsBrief.headline || baseBrief.headline,
      summary: opsBrief.summary || baseBrief.summary,
      highestPriorities:
        opsBrief.highestPriorities.length > 0
          ? opsBrief.highestPriorities
          : baseBrief.highestPriorities,
      risks:
        opsBrief.risks.length > 0 ? opsBrief.risks : baseBrief.risks,
      pendingApprovals:
        opsBrief.pendingApprovals.length > 0
          ? opsBrief.pendingApprovals
          : baseBrief.pendingApprovals,
      suggestedActions:
        opsBrief.suggestedActions.length > 0
          ? opsBrief.suggestedActions
          : baseBrief.suggestedActions,
      whatChanged: opsBrief.whatChanged,
      currentBlockers: opsBrief.currentBlockers,
      decisionsNeeded: opsBrief.decisionsNeeded,
      employeesWaiting: opsBrief.employeesWaiting,
      completedWork: opsBrief.completedWork,
      recommendedNextAction: opsBrief.recommendedNextAction,
      opportunities:
        opsBrief.opportunities.length > 0
          ? opsBrief.opportunities
          : baseBrief.opportunities,
    };
  } catch {
    /* OS v2 briefing is additive — keep proactive brief on failure */
  }
  const priorityAlerts = buildPriorityAlerts(signals, recommendations);
  const companyHealth = computeCompanyHealth({
    metrics: options?.metrics ?? {
      activeMissions: 0,
      employeesWorking: 0,
      waitingForApproval: pendingApprovals.length,
      completedToday: 0,
      averageCompletionTimeMs: null,
      averageCompletionTimeDisplay: null,
      companyProductivity: 70,
    },
    recommendations,
    risks: executiveBrief.risks,
  });

  return {
    executiveBrief,
    recommendations,
    priorityAlerts,
    risks: executiveBrief.risks,
    opportunities: executiveBrief.opportunities,
    companyHealth,
    signals,
  };
}

export async function decideProactiveRecommendation(input: {
  recommendationId: string;
  action: CeoRecommendationAction;
  note?: string | null;
  reassignToEmployeeId?: string | null;
  delayUntil?: string | null;
  repoRoot?: string;
  workspaceId?: string;
  actor?: {
    userId: string;
    displayName: string;
    role: import("./workspace/types").WorkspaceHumanRole;
  };
}): Promise<
  | { ok: true; recommendation: EmployeeRecommendation; execution: ExecutionRecord | null }
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
  const workspaceId = input.workspaceId ?? "default";
  const existing = getProactiveRecommendation(input.recommendationId, root, workspaceId);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Recommendation not found",
      status: 404,
    };
  }

  if (input.action === "reassign") {
    const target = input.reassignToEmployeeId?.trim();
    if (!target || !getEmployeeDefinition(target)) {
      return {
        ok: false,
        code: "INVALID_REASSIGN",
        message: "reassignToEmployeeId must be a known AI Employee",
        status: 400,
      };
    }
  }

  try {
    const updated = applyRecommendationDecision(existing, {
      action: input.action,
      note: input.note,
      reassignToEmployeeId: input.reassignToEmployeeId,
      delayUntil: input.delayUntil,
    });
    upsertProactiveRecommendation(updated, root, workspaceId);

    let execution: ExecutionRecord | null = null;
    if (input.action === "approve") {
      const prepared = await prepareExternalWorkForEmployee({
        employeeId: updated.leadEmployeeId,
        missionId: null,
        requestedAction: updated.title,
        params: {
          guidance: updated.recommendation,
          body: updated.recommendation,
          note: updated.reasoning,
          title: updated.title,
        },
        repoRoot: root,
        workspaceId,
      });
      if (prepared.ok && prepared.record) execution = prepared.record;
    }

    if (input.actor) {
      const { recordWorkspaceEvent } = await import("./workspace/collaboration-feed");
      recordWorkspaceEvent({
        workspaceId,
        kind: "approval",
        summary: `${input.actor.displayName} ${input.action}d recommendation “${updated.title}”`,
        actorUserId: input.actor.userId,
        actorName: input.actor.displayName,
        actorRole: input.actor.role,
        relatedType: "recommendation",
        relatedId: updated.id,
        status: updated.status,
        auditAction: `recommendation.${input.action}`,
        repoRoot: root,
      });
    }

    return { ok: true, recommendation: updated, execution };
  } catch {
    return { ok: false, code: "INVALID", message: "Decision failed", status: 400 };
  }
}
