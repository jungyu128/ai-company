/**
 * Company Learning Engine — pure derive. Never invents facts without sourceRefs.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import type {
  CompanyLearningView,
  EvolutionSignal,
  KnowledgeCategory,
  KnowledgeRecord,
  KnowledgeSearchHit,
  MissionLearningInput,
  MissionLessonRecord,
  PlanningKnowledgeAdvice,
} from "./types";

function newId(prefix: string, at: string): string {
  return `${prefix}-${at.replace(/[^0-9]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasEvidence(input: MissionLearningInput): boolean {
  return (
    input.completedWork.length > 0 ||
    input.failedWork.length > 0 ||
    input.blockedWork.length > 0 ||
    input.ceoApprovals.length > 0 ||
    input.ceoRejections.length > 0 ||
    input.qaNotes.length > 0 ||
    input.reviewNotes.length > 0 ||
    input.architectureNotes.length > 0 ||
    input.timelineSummaries.length > 0 ||
    input.analyticsBlockers.length > 0 ||
    input.deploymentNotes.length > 0 ||
    input.incidentNotes.length > 0 ||
    !!input.sprintOutcome
  );
}

function pushUnique(list: string[], value: string | null | undefined) {
  const v = value?.trim();
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

/**
 * Derive a mission lesson only when recorded evidence exists.
 * Returns null when there is nothing to learn (never fabricates).
 */
export function deriveMissionLesson(
  input: MissionLearningInput
): { lesson: MissionLessonRecord; knowledge: KnowledgeRecord[] } | null {
  if (!hasEvidence(input)) return null;

  const sourceRefs: string[] = [];
  const whatWentWell: string[] = [];
  const whatWentWrong: string[] = [];
  const rootCause: string[] = [];
  const lessonsLearned: string[] = [];
  const processImprovements: string[] = [];
  const engineeringImprovements: string[] = [];
  const aiReasoningImprovements: string[] = [];
  const futurePrevention: string[] = [];
  const bestPractices: string[] = [];

  for (const w of input.completedWork) {
    pushUnique(sourceRefs, `workItem:${w.id}`);
    pushUnique(
      whatWentWell,
      `Completed “${w.title}” by ${getEmployeeDefinition(w.ownerId)?.name ?? w.ownerId}`
    );
    pushUnique(
      bestPractices,
      `Reuse assignment pattern for ${getEmployeeDefinition(w.ownerId)?.role ?? "role"} on similar objectives`
    );
  }

  for (const w of input.failedWork) {
    pushUnique(sourceRefs, `workItem:${w.id}`);
    pushUnique(whatWentWrong, `Failed/rejected “${w.title}”: ${w.reason}`);
    pushUnique(rootCause, w.reason);
    pushUnique(futurePrevention, `Re-check gates before retrying “${w.title}”`);
  }

  for (const w of input.blockedWork) {
    pushUnique(sourceRefs, `workItem:${w.id}`);
    pushUnique(whatWentWrong, `Blocked “${w.title}”: ${w.reason}`);
    pushUnique(rootCause, w.reason);
    pushUnique(processImprovements, `Clear blocker earlier: ${w.reason}`);
  }

  for (const a of input.ceoApprovals) {
    pushUnique(sourceRefs, `approval:${a.decision}:${a.summary.slice(0, 48)}`);
    pushUnique(whatWentWell, `CEO ${a.decision}: ${a.summary}`);
    pushUnique(lessonsLearned, `Approval path that worked: ${a.summary}`);
  }

  for (const r of input.ceoRejections) {
    pushUnique(sourceRefs, `rejection:${r.decision}:${r.summary.slice(0, 48)}`);
    pushUnique(whatWentWrong, `CEO ${r.decision}: ${r.summary}`);
    pushUnique(rootCause, r.summary);
    pushUnique(aiReasoningImprovements, `Surface rejection reason earlier: ${r.summary}`);
    pushUnique(futurePrevention, `Avoid repeating rejected pattern: ${r.summary}`);
  }

  for (const note of input.qaNotes) {
    pushUnique(sourceRefs, `qa:${note.slice(0, 40)}`);
    pushUnique(lessonsLearned, `QA: ${note}`);
    pushUnique(engineeringImprovements, `Strengthen verification: ${note}`);
  }

  for (const note of input.reviewNotes) {
    pushUnique(sourceRefs, `review:${note.slice(0, 40)}`);
    pushUnique(lessonsLearned, `Review: ${note}`);
    pushUnique(engineeringImprovements, `Address review theme: ${note}`);
  }

  for (const note of input.architectureNotes) {
    pushUnique(sourceRefs, `architecture:${note.slice(0, 40)}`);
    pushUnique(lessonsLearned, `Architecture: ${note}`);
    pushUnique(engineeringImprovements, `Architecture follow-up: ${note}`);
  }

  for (const b of input.analyticsBlockers) {
    for (const id of b.exampleIds.slice(0, 3)) {
      pushUnique(sourceRefs, `analyticsBlocker:${id}`);
    }
    pushUnique(sourceRefs, `analyticsBlocker:${b.label}`);
    if (b.count >= 2) {
      pushUnique(whatWentWrong, `Repeated blocker “${b.label}” (×${b.count})`);
      pushUnique(rootCause, `Recurring blocker pattern: ${b.label}`);
      pushUnique(
        processImprovements,
        `Add checklist to prevent “${b.label}” (seen ${b.count} times)`
      );
      pushUnique(futurePrevention, `Monitor recurrence of “${b.label}”`);
    }
  }

  for (const t of input.timelineSummaries) {
    pushUnique(sourceRefs, `timeline:${t.id}`);
    if (t.kind === "work_completed") {
      pushUnique(whatWentWell, t.summary);
    } else if (t.kind === "blocked") {
      pushUnique(whatWentWrong, t.summary);
    } else if (t.kind === "review_completed") {
      pushUnique(lessonsLearned, t.summary);
    } else if (t.kind === "approval_granted") {
      pushUnique(whatWentWell, t.summary);
    }
  }

  for (const d of input.deploymentNotes) {
    pushUnique(sourceRefs, `deploy:${d.slice(0, 40)}`);
    pushUnique(lessonsLearned, `Deployment: ${d}`);
  }

  for (const i of input.incidentNotes) {
    pushUnique(sourceRefs, `incident:${i.slice(0, 40)}`);
    pushUnique(whatWentWrong, `Incident: ${i}`);
    pushUnique(futurePrevention, `Incident follow-up: ${i}`);
  }

  if (input.sprintOutcome) {
    pushUnique(sourceRefs, `sprint:${input.sprintOutcome.slice(0, 48)}`);
    pushUnique(lessonsLearned, `Sprint outcome: ${input.sprintOutcome}`);
  }

  // Require at least one concrete learning bullet + source ref
  const anyLesson =
    whatWentWell.length +
      whatWentWrong.length +
      lessonsLearned.length +
      processImprovements.length >
    0;
  if (!anyLesson || sourceRefs.length === 0) return null;

  if (whatWentWell.length > 0 && whatWentWrong.length === 0) {
    pushUnique(
      aiReasoningImprovements,
      "Prioritize reusing completed assignment/review patterns on similar directives"
    );
  }

  const lessonId = newId("lesson", input.recordedAt);
  const knowledge = deriveKnowledgeFromLessonBullets({
    lessonId,
    at: input.recordedAt,
    sourceRefs,
    whatWentWell,
    lessonsLearned,
    processImprovements,
    engineeringImprovements,
    bestPractices,
    futurePrevention,
    ceoRejections: input.ceoRejections,
    architectureNotes: input.architectureNotes,
    qaNotes: input.qaNotes,
    deploymentNotes: input.deploymentNotes,
  });

  const lesson: MissionLessonRecord = {
    id: lessonId,
    missionKey: input.missionKey,
    directiveId: input.directiveId,
    planId: input.planId,
    title: input.title,
    recordedAt: input.recordedAt,
    whatWentWell,
    whatWentWrong,
    rootCause,
    lessonsLearned,
    processImprovements,
    engineeringImprovements,
    aiReasoningImprovements,
    futurePrevention,
    bestPractices,
    sourceRefs,
    knowledgeIds: knowledge.map((k) => k.id),
  };

  return { lesson, knowledge };
}

function deriveKnowledgeFromLessonBullets(input: {
  lessonId: string;
  at: string;
  sourceRefs: string[];
  whatWentWell: string[];
  lessonsLearned: string[];
  processImprovements: string[];
  engineeringImprovements: string[];
  bestPractices: string[];
  futurePrevention: string[];
  ceoRejections: Array<{ summary: string }>;
  architectureNotes: string[];
  qaNotes: string[];
  deploymentNotes: string[];
}): KnowledgeRecord[] {
  const out: KnowledgeRecord[] = [];

  const add = (
    category: KnowledgeCategory,
    title: string,
    body: string,
    patternKey: string,
    confidence: number
  ) => {
    out.push({
      id: newId("know", input.at),
      category,
      title,
      body,
      confidence,
      patternKey,
      sourceRefs: input.sourceRefs.slice(0, 12),
      derivedFromLessonId: input.lessonId,
      createdAt: input.at,
      supersededById: null,
    });
  };

  for (const b of input.bestPractices.slice(0, 3)) {
    add(
      "team_best_practice",
      "Team best practice",
      b,
      `best:${b.slice(0, 48).toLowerCase()}`,
      70
    );
  }
  for (const b of input.whatWentWell.slice(0, 3)) {
    add(
      "engineering_pattern",
      "Engineering pattern from success",
      b,
      `eng:${b.slice(0, 48).toLowerCase()}`,
      65
    );
  }
  for (const b of input.architectureNotes.slice(0, 2)) {
    add(
      "architecture_decision",
      "Architecture decision",
      b,
      `adr:${b.slice(0, 48).toLowerCase()}`,
      60
    );
  }
  for (const b of input.qaNotes.slice(0, 2)) {
    add("qa_rule", "QA rule", b, `qa:${b.slice(0, 48).toLowerCase()}`, 65);
  }
  for (const b of input.engineeringImprovements.slice(0, 2)) {
    add(
      "coding_standard",
      "Engineering improvement",
      b,
      `code:${b.slice(0, 48).toLowerCase()}`,
      55
    );
  }
  for (const b of input.processImprovements.slice(0, 2)) {
    add(
      "review_rule",
      "Process / review improvement",
      b,
      `proc:${b.slice(0, 48).toLowerCase()}`,
      60
    );
  }
  for (const r of input.ceoRejections.slice(0, 2)) {
    add(
      "ceo_preference",
      "CEO preference (from rejection)",
      r.summary,
      `ceo:${r.summary.slice(0, 48).toLowerCase()}`,
      75
    );
  }
  for (const d of input.deploymentNotes.slice(0, 2)) {
    add(
      "deployment_policy",
      "Deployment policy note",
      d,
      `deploy:${d.slice(0, 48).toLowerCase()}`,
      70
    );
  }
  for (const b of input.lessonsLearned.slice(0, 2)) {
    add(
      "product_decision",
      "Product / mission lesson",
      b,
      `prod:${b.slice(0, 48).toLowerCase()}`,
      55
    );
  }

  return out.slice(0, 16);
}

export function deriveEvolutionSignals(input: {
  now: string;
  analyticsBlockers: Array<{ label: string; count: number; exampleIds: string[] }>;
  rejectionReasons: string[];
  reviewThemes: string[];
  architectureThemes: string[];
  failedTitles: string[];
}): EvolutionSignal[] {
  const signals: EvolutionSignal[] = [];

  for (const b of input.analyticsBlockers) {
    if (b.count < 2) continue;
    signals.push({
      id: newId("evo", input.now),
      kind: "repeated_blocker",
      label: b.label,
      count: b.count,
      exampleRefs: b.exampleIds.map((id) => `workItem:${id}`),
      recommendation: `Add a prevention checklist for repeated blocker “${b.label}”`,
      recordedAt: input.now,
      sourceRefs: [
        `analyticsBlocker:${b.label}`,
        ...b.exampleIds.slice(0, 3).map((id) => `workItem:${id}`),
      ],
    });
  }

  const countStrings = (values: string[]) => {
    const map = new Map<string, number>();
    for (const v of values) {
      const key = v.trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };

  for (const [key, count] of countStrings(input.rejectionReasons)) {
    if (count < 2) continue;
    const label = input.rejectionReasons.find((r) => r.toLowerCase() === key) ?? key;
    signals.push({
      id: newId("evo", input.now),
      kind: "repeated_approval_reason",
      label,
      count,
      exampleRefs: [`rejection:${key}`],
      recommendation: `Adjust planning to address repeated CEO rejection theme: ${label}`,
      recordedAt: input.now,
      sourceRefs: [`rejection:${key}`],
    });
  }

  for (const [key, count] of countStrings(input.reviewThemes)) {
    if (count < 2) continue;
    const label = input.reviewThemes.find((r) => r.toLowerCase() === key) ?? key;
    signals.push({
      id: newId("evo", input.now),
      kind: "repeated_review_comment",
      label,
      count,
      exampleRefs: [`review:${key}`],
      recommendation: `Codify review expectation: ${label}`,
      recordedAt: input.now,
      sourceRefs: [`review:${key}`],
    });
  }

  for (const [key, count] of countStrings(input.architectureThemes)) {
    if (count < 2) continue;
    const label =
      input.architectureThemes.find((r) => r.toLowerCase() === key) ?? key;
    signals.push({
      id: newId("evo", input.now),
      kind: "repeated_architecture_issue",
      label,
      count,
      exampleRefs: [`architecture:${key}`],
      recommendation: `Capture ADR for recurring architecture issue: ${label}`,
      recordedAt: input.now,
      sourceRefs: [`architecture:${key}`],
    });
  }

  for (const [key, count] of countStrings(input.failedTitles)) {
    if (count < 2) continue;
    const label = input.failedTitles.find((r) => r.toLowerCase() === key) ?? key;
    signals.push({
      id: newId("evo", input.now),
      kind: "repeated_bug",
      label,
      count,
      exampleRefs: [`failed:${key}`],
      recommendation: `Investigate recurring failure theme: ${label}`,
      recordedAt: input.now,
      sourceRefs: [`failed:${key}`],
    });
  }

  return signals;
}

export function searchKnowledge(
  knowledge: KnowledgeRecord[],
  query: string,
  limit = 8
): KnowledgeSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const active = knowledge.filter((k) => !k.supersededById);
  const hits: KnowledgeSearchHit[] = [];

  for (const k of active) {
    const hay = `${k.title} ${k.body} ${k.patternKey} ${k.category}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const t of tokens) {
      if (hay.includes(t)) score += 2;
    }
    if (score <= 0) continue;
    hits.push({
      knowledge: k,
      score: score + Math.round(k.confidence / 20),
      reason:
        k.category === "ceo_preference"
          ? "Matches recorded CEO preference"
          : k.category === "engineering_pattern"
            ? "Matches prior successful engineering pattern"
            : `Matches ${k.category.replace(/_/g, " ")}`,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildPlanningKnowledgeAdvice(input: {
  query: string;
  knowledge: KnowledgeRecord[];
  evolution: EvolutionSignal[];
  completedOwnerIds: string[];
}): PlanningKnowledgeAdvice {
  const hits = searchKnowledge(input.knowledge, input.query, 10);
  const reusedSolutions = hits.filter(
    (h) =>
      h.knowledge.category === "engineering_pattern" ||
      h.knowledge.category === "team_best_practice" ||
      h.knowledge.category === "architecture_decision"
  );
  const repeatedMistakeWarnings = [
    ...hits.filter(
      (h) =>
        h.knowledge.category === "ceo_preference" ||
        h.knowledge.category === "qa_rule" ||
        h.knowledge.body.toLowerCase().includes("block")
    ),
    ...input.evolution
      .filter((e) => e.count >= 2)
      .slice(0, 4)
      .map((e) => ({
        knowledge: {
          id: e.id,
          category: "review_rule" as const,
          title: e.label,
          body: e.recommendation,
          confidence: Math.min(90, 40 + e.count * 10),
          patternKey: e.kind,
          sourceRefs: e.sourceRefs,
          derivedFromLessonId: null,
          createdAt: e.recordedAt,
          supersededById: null,
        },
        score: e.count * 5,
        reason: `Repeated ${e.kind.replace(/_/g, " ")} (×${e.count})`,
      })),
  ].slice(0, 6);

  const successfulImplementationHints = hits.filter(
    (h) =>
      h.knowledge.category === "engineering_pattern" ||
      h.knowledge.category === "product_decision"
  );

  const ownerCounts = new Map<string, number>();
  for (const id of input.completedOwnerIds) {
    ownerCounts.set(id, (ownerCounts.get(id) ?? 0) + 1);
  }
  const recommendedEngineers = [...ownerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([employeeId, count]) => ({
      employeeId,
      employeeName: getEmployeeDefinition(employeeId)?.name ?? employeeId,
      reason: `${count} recorded successful completion(s) on similar prior work`,
      sourceRefs: [`employeeCompletions:${employeeId}:${count}`],
    }));

  const analysisNotes: string[] = [];
  if (reusedSolutions[0]) {
    analysisNotes.push(
      `Knowledge reuse: ${reusedSolutions[0].knowledge.body.slice(0, 160)}`
    );
  }
  if (repeatedMistakeWarnings[0]) {
    analysisNotes.push(
      `Repeated-mistake warning: ${repeatedMistakeWarnings[0].reason}`
    );
  }
  if (recommendedEngineers[0]) {
    analysisNotes.push(
      `Strong history: ${recommendedEngineers[0].employeeName} (${recommendedEngineers[0].reason})`
    );
  }

  return {
    reusedSolutions: reusedSolutions.slice(0, 5),
    repeatedMistakeWarnings,
    successfulImplementationHints: successfulImplementationHints.slice(0, 5),
    recommendedEngineers,
    analysisNotes,
  };
}

export function computeMaturityScore(input: {
  lessonCount: number;
  activeKnowledge: number;
  evolutionCount: number;
}): { score: number; label: CompanyLearningView["companyMaturityLabel"] } {
  const score = Math.min(
    100,
    input.lessonCount * 8 +
      input.activeKnowledge * 3 +
      Math.min(20, input.evolutionCount * 4)
  );
  const label: CompanyLearningView["companyMaturityLabel"] =
    score >= 75
      ? "Mature"
      : score >= 50
        ? "Proficient"
        : score >= 25
          ? "Developing"
          : "Emerging";
  return { score, label };
}

export function buildCompanyLearningView(input: {
  generatedAt: string;
  lessons: MissionLessonRecord[];
  knowledge: KnowledgeRecord[];
  evolution: EvolutionSignal[];
}): CompanyLearningView {
  const activeKnowledge = input.knowledge.filter((k) => !k.supersededById);
  const maturity = computeMaturityScore({
    lessonCount: input.lessons.length,
    activeKnowledge: activeKnowledge.length,
    evolutionCount: input.evolution.length,
  });

  const last = input.lessons[0] ?? null;
  const processImprovementRecommendations = [
    ...input.lessons.flatMap((l) => l.processImprovements),
    ...input.evolution.map((e) => e.recommendation),
  ]
    .filter(Boolean)
    .slice(0, 10);

  return {
    generatedAt: input.generatedAt,
    generatedAtDisplay: formatHqDateTimeDisplay(input.generatedAt),
    lessonsLearned: input.lessons.slice(0, 8).map((l) => ({
      id: l.id,
      title: l.title,
      recordedAtDisplay: formatHqDateTimeDisplay(l.recordedAt),
      highlights: [
        ...l.lessonsLearned.slice(0, 2),
        ...l.whatWentWell.slice(0, 1),
        ...l.whatWentWrong.slice(0, 1),
      ].slice(0, 4),
      sourceRefs: l.sourceRefs.slice(0, 8),
    })),
    recentlyLearnedPatterns: activeKnowledge.slice(0, 8).map((k) => ({
      id: k.id,
      category: k.category,
      title: k.title,
      body: k.body,
      confidence: k.confidence,
    })),
    repeatedProblems: input.evolution.slice(0, 8).map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      count: e.count,
      recommendation: e.recommendation,
    })),
    processImprovementRecommendations,
    companyMaturityScore: maturity.score,
    companyMaturityLabel: maturity.label,
    knowledgeGrowth: {
      totalLessons: input.lessons.length,
      totalKnowledge: input.knowledge.length,
      activeKnowledge: activeKnowledge.length,
      evolutionSignals: input.evolution.length,
      lastLearnedAt: last?.recordedAt ?? null,
      lastLearnedAtDisplay: last
        ? formatHqDateTimeDisplay(last.recordedAt)
        : null,
    },
  };
}
