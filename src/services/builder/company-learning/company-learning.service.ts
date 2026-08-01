/**
 * Company Learning Engine service — observe recorded state, append lessons, advise planning.
 */

import path from "node:path";
import { getEmployeeDefinition } from "../ai-company-employees";
import { getCompanyAnalyticsView } from "../analytics/analytics.service";
import { getCompanyTimeline } from "../company-timeline";
import { getDailyOpsSnapshot } from "../daily-ops";
import type { DailyDirective, DailyExecutionPlan, DailyWorkItem } from "../daily-ops/types";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { listWorkpilotExecutions } from "../workpilot-execution/workpilot-execution.store";
import {
  buildCompanyLearningView,
  buildPlanningKnowledgeAdvice,
  deriveEvolutionSignals,
  deriveMissionLesson,
} from "./company-learning.logic";
import {
  appendEvolutionSignals,
  appendMissionLesson,
  getCompanyKnowledgeStore,
  hasLessonForMission,
  listEvolution,
  listKnowledge,
  listLessons,
} from "./company-learning.store";
import type {
  CompanyLearningView,
  MissionLearningInput,
  PlanningKnowledgeAdvice,
} from "./types";

function missionKeyFor(directiveId: string, planId: string | null): string {
  return `directive:${directiveId}:plan:${planId ?? "none"}`;
}

function buildLearningInputFromPlan(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  now: string;
  repoRoot: string;
  workspaceId: string;
}): MissionLearningInput {
  const items = input.plan.proposedWorkItems;
  const completed = items.filter((w) => w.status === "COMPLETED");
  const failed = items.filter((w) =>
    ["REJECTED", "CANCELLED"].includes(w.status)
  );
  const blocked = items.filter((w) => w.status === "BLOCKED");

  const timeline = getCompanyTimeline({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    limit: 80,
    now: input.now,
  });

  let analyticsBlockers: MissionLearningInput["analyticsBlockers"] = [];
  try {
    const analytics = getCompanyAnalyticsView({
      repoRoot: input.repoRoot,
      workspaceId: input.workspaceId,
      now: input.now,
    });
    analyticsBlockers = analytics.snapshot.recurringBlockers.map((b) => ({
      label: b.label,
      count: b.count,
      exampleIds: b.exampleWorkItemIds,
    }));
  } catch {
    analyticsBlockers = [];
  }

  const packages = listWorkpilotExecutions(input.repoRoot, input.workspaceId);
  const deploymentNotes = packages
    .filter((p) => ["succeeded", "failed", "blocked"].includes(p.status))
    .map(
      (p) =>
        `WorkPilot ${p.status}: ${p.goal}${p.blockerReason ? ` (${p.blockerReason})` : ""}`
    );

  const qaNotes = items
    .filter((w) => w.status === "QA" || w.status === "COMPLETED")
    .flatMap((w) => w.testPlan?.slice(0, 2) ?? [])
    .concat(
      items
        .filter((w) => /qa|verification/i.test(w.title))
        .map((w) => `${w.title}: ${w.status}`)
    );

  const reviewNotes = items
    .filter((w) => ["REVIEWING", "QA", "COMPLETED"].includes(w.status))
    .map(
      (w) =>
        `Review owner ${getEmployeeDefinition(w.reviewOwnerId)?.name ?? w.reviewOwnerId} on “${w.title}”`
    );

  const architectureNotes = items
    .filter((w) => /architect|architecture/i.test(`${w.title} ${w.objective}`))
    .map((w) => `${w.title}: ${w.status} — ${w.expectedOutput}`);

  const approvals = input.plan.approvalRequirements
    .filter((a) => a.status === "approved")
    .map((a) => ({ summary: a.summary, decision: "approved" }));
  const rejections = input.plan.approvalRequirements
    .filter((a) => a.status === "rejected" || a.status === "changes_requested")
    .map((a) => ({ summary: a.summary, decision: a.status }));

  const relatedTimeline = timeline.events.filter(
    (e) =>
      e.directiveId === input.directive.id ||
      e.planId === input.plan.id ||
      items.some((w) => w.id === e.workItemId)
  );

  return {
    missionKey: missionKeyFor(input.directive.id, input.plan.id),
    title: input.directive.title,
    directiveId: input.directive.id,
    planId: input.plan.id,
    recordedAt: input.now,
    completedWork: completed.map((w) => ({
      id: w.id,
      title: w.title,
      ownerId: w.assignedEmployeeId,
      status: w.status,
    })),
    failedWork: failed.map((w) => ({
      id: w.id,
      title: w.title,
      reason: w.blockedReason ?? w.status,
    })),
    blockedWork: blocked.map((w) => ({
      id: w.id,
      title: w.title,
      reason: w.blockedReason ?? w.pendingProtectedReason ?? "Blocked",
    })),
    qaNotes,
    reviewNotes,
    architectureNotes,
    ceoApprovals: approvals,
    ceoRejections: rejections,
    sprintOutcome: null,
    deploymentNotes,
    incidentNotes: packages
      .filter((p) => p.status === "failed")
      .map((p) => p.blockerReason ?? p.goal),
    analyticsBlockers,
    timelineSummaries: relatedTimeline.slice(0, 20).map((e) => ({
      kind: e.kind,
      summary: e.summary,
      id: e.id,
    })),
  };
}

/** Learn from a completed directive/plan — append-only, idempotent per missionKey. */
export function learnFromCompletedMission(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; appended: boolean; lessonId: string | null; message: string }
  | { ok: false; message: string } {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const key = missionKeyFor(input.directive.id, input.plan.id);

  if (hasLessonForMission(key, root, workspaceId)) {
    return {
      ok: true,
      appended: false,
      lessonId: listLessons(root, workspaceId).find((l) => l.missionKey === key)?.id ?? null,
      message: "Lesson already recorded for this mission",
    };
  }

  const learningInput = buildLearningInputFromPlan({
    directive: input.directive,
    plan: input.plan,
    now,
    repoRoot: root,
    workspaceId,
  });

  const derived = deriveMissionLesson(learningInput);
  if (!derived) {
    return {
      ok: true,
      appended: false,
      lessonId: null,
      message: "No recorded evidence to learn from — nothing fabricated",
    };
  }

  const result = appendMissionLesson({
    lesson: derived.lesson,
    knowledge: derived.knowledge,
    repoRoot: root,
    workspaceId,
  });

  // Evolution signals from analytics + this mission
  const evo = deriveEvolutionSignals({
    now,
    analyticsBlockers: learningInput.analyticsBlockers,
    rejectionReasons: learningInput.ceoRejections.map((r) => r.summary),
    reviewThemes: learningInput.reviewNotes,
    architectureThemes: learningInput.architectureNotes,
    failedTitles: learningInput.failedWork.map((f) => f.title),
  });
  appendEvolutionSignals({ signals: evo, repoRoot: root, workspaceId });

  return {
    ok: true,
    appended: result.appended,
    lessonId: result.lesson.id,
    message: result.appended
      ? `Recorded lesson with ${derived.knowledge.length} knowledge entries`
      : "Lesson already present",
  };
}

/** Scan daily-ops for completed directives missing lessons. */
export function observeAndLearnFromRecordedMissions(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): { learned: number; skipped: number } {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const snap = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });

  // Prefer completed today; also learn when all work items completed on active plan
  let learned = 0;
  let skipped = 0;

  const candidates: Array<{ directive: DailyDirective; plan: DailyExecutionPlan }> =
    [];

  if (snap.today && snap.activePlan) {
    const allDone =
      snap.activePlan.proposedWorkItems.length > 0 &&
      snap.activePlan.proposedWorkItems.every((w) =>
        ["COMPLETED", "REJECTED", "CANCELLED"].includes(w.status)
      );
    if (snap.today.status === "COMPLETED" || allDone) {
      candidates.push({ directive: snap.today, plan: snap.activePlan });
    }
  }

  for (const c of candidates) {
    const res = learnFromCompletedMission({
      directive: c.directive,
      plan: c.plan,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (res.ok && res.appended) learned += 1;
    else skipped += 1;
  }

  return { learned, skipped };
}

export function getPlanningKnowledgeAdvice(input: {
  query: string;
  repoRoot?: string;
  workspaceId?: string;
}): PlanningKnowledgeAdvice {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const knowledge = listKnowledge(root, workspaceId);
  const evolution = listEvolution(root, workspaceId);
  const lessons = listLessons(root, workspaceId);
  const completedOwnerIds = lessons.flatMap((l) =>
    // Owners inferred from source work item refs are not stored; use knowledge bodies mentioning employees weakly.
    // Prefer explicit completed work from learning input stored in lesson title only — track via knowledge patterns.
    []
  );

  // Collect owner ids from knowledge sourceRefs like employeeCompletions — and from lesson best practices text
  const ownersFromLessons: string[] = [];
  for (const l of lessons) {
    for (const line of l.whatWentWell) {
      for (const emp of [
        "sarah",
        "alex",
        "david",
        "noah",
        "olivia",
        "emma",
        "daniel",
        "sophia",
      ]) {
        const name = getEmployeeDefinition(emp)?.name;
        if (name && line.includes(name)) ownersFromLessons.push(emp);
      }
    }
  }

  return buildPlanningKnowledgeAdvice({
    query: input.query,
    knowledge,
    evolution,
    completedOwnerIds: [...completedOwnerIds, ...ownersFromLessons],
  });
}

export function getCompanyLearningView(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  /** When true, attempt observe-and-learn before building the view. */
  observe?: boolean;
}): CompanyLearningView {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();

  if (input?.observe !== false) {
    observeAndLearnFromRecordedMissions({
      repoRoot: root,
      workspaceId,
      now,
    });
  }

  const store = getCompanyKnowledgeStore(root, workspaceId);
  return buildCompanyLearningView({
    generatedAt: now,
    lessons: store.lessons,
    knowledge: store.knowledge,
    evolution: store.evolution,
  });
}

/** Format advice into analysis notes for daily-ops planning. */
export function formatAdviceForAnalysisNotes(
  advice: PlanningKnowledgeAdvice
): string {
  if (advice.analysisNotes.length === 0) {
    return "Company knowledge search: no matching recorded lessons yet.";
  }
  return [
    "Company knowledge (recorded only):",
    ...advice.analysisNotes.map((n) => `• ${n}`),
    ...advice.repeatedMistakeWarnings.slice(0, 2).map(
      (w) => `• Warning: ${w.knowledge.body.slice(0, 120)}`
    ),
  ].join("\n");
}

export function collectCompletedOwnersFromItems(
  items: DailyWorkItem[]
): string[] {
  return items
    .filter((w) => w.status === "COMPLETED")
    .map((w) => w.assignedEmployeeId);
}
