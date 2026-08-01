/**
 * Company Learning Engine — organization knowledge from recorded mission state.
 * Never fabricates. Append-only history. Everything is source-traceable.
 */

export type KnowledgeCategory =
  | "engineering_pattern"
  | "architecture_decision"
  | "coding_standard"
  | "qa_rule"
  | "review_rule"
  | "product_decision"
  | "ceo_preference"
  | "deployment_policy"
  | "team_best_practice";

/** Append-only ledger entry — never mutated after write. */
export type KnowledgeLedgerEntry = {
  id: string;
  at: string;
  op: "record_lesson" | "record_knowledge" | "record_evolution";
  /** Payload id (lesson / knowledge / evolution). */
  entityId: string;
  /** Human-readable summary for audit. */
  summary: string;
};

export type MissionLessonRecord = {
  id: string;
  /** Stable key for the completed mission/directive — used to avoid re-learning. */
  missionKey: string;
  directiveId: string | null;
  planId: string | null;
  title: string;
  recordedAt: string;
  whatWentWell: string[];
  whatWentWrong: string[];
  rootCause: string[];
  lessonsLearned: string[];
  processImprovements: string[];
  engineeringImprovements: string[];
  aiReasoningImprovements: string[];
  futurePrevention: string[];
  bestPractices: string[];
  /** Traceability — every bullet must be backed by these refs. */
  sourceRefs: string[];
  /** Knowledge entry ids derived from this lesson (append-only links). */
  knowledgeIds: string[];
};

export type KnowledgeRecord = {
  id: string;
  category: KnowledgeCategory;
  title: string;
  body: string;
  confidence: number;
  patternKey: string;
  sourceRefs: string[];
  derivedFromLessonId: string | null;
  createdAt: string;
  /** If later superseded, points to newer record id — old row stays. */
  supersededById: string | null;
};

export type EvolutionSignal = {
  id: string;
  kind:
    | "repeated_blocker"
    | "repeated_bug"
    | "repeated_approval_reason"
    | "repeated_review_comment"
    | "repeated_architecture_issue";
  label: string;
  count: number;
  exampleRefs: string[];
  recommendation: string;
  recordedAt: string;
  sourceRefs: string[];
};

export type CompanyKnowledgeStoreShape = {
  ledger: KnowledgeLedgerEntry[];
  lessons: MissionLessonRecord[];
  knowledge: KnowledgeRecord[];
  evolution: EvolutionSignal[];
};

export type KnowledgeSearchHit = {
  knowledge: KnowledgeRecord;
  score: number;
  reason: string;
};

export type PlanningKnowledgeAdvice = {
  reusedSolutions: KnowledgeSearchHit[];
  repeatedMistakeWarnings: KnowledgeSearchHit[];
  successfulImplementationHints: KnowledgeSearchHit[];
  recommendedEngineers: Array<{
    employeeId: string;
    employeeName: string;
    reason: string;
    sourceRefs: string[];
  }>;
  analysisNotes: string[];
};

export type CompanyLearningView = {
  generatedAt: string;
  generatedAtDisplay: string;
  lessonsLearned: Array<{
    id: string;
    title: string;
    recordedAtDisplay: string;
    highlights: string[];
    sourceRefs: string[];
  }>;
  recentlyLearnedPatterns: Array<{
    id: string;
    category: KnowledgeCategory;
    title: string;
    body: string;
    confidence: number;
  }>;
  repeatedProblems: Array<{
    id: string;
    kind: EvolutionSignal["kind"];
    label: string;
    count: number;
    recommendation: string;
  }>;
  processImprovementRecommendations: string[];
  companyMaturityScore: number;
  companyMaturityLabel: "Emerging" | "Developing" | "Proficient" | "Mature";
  knowledgeGrowth: {
    totalLessons: number;
    totalKnowledge: number;
    activeKnowledge: number;
    evolutionSignals: number;
    lastLearnedAt: string | null;
    lastLearnedAtDisplay: string | null;
  };
};

/** Observable inputs — all must already exist in recorded stores. */
export type MissionLearningInput = {
  missionKey: string;
  title: string;
  directiveId: string | null;
  planId: string | null;
  recordedAt: string;
  completedWork: Array<{ id: string; title: string; ownerId: string; status: string }>;
  failedWork: Array<{ id: string; title: string; reason: string }>;
  blockedWork: Array<{ id: string; title: string; reason: string }>;
  qaNotes: string[];
  reviewNotes: string[];
  architectureNotes: string[];
  ceoApprovals: Array<{ summary: string; decision: string }>;
  ceoRejections: Array<{ summary: string; decision: string }>;
  sprintOutcome: string | null;
  deploymentNotes: string[];
  incidentNotes: string[];
  analyticsBlockers: Array<{ label: string; count: number; exampleIds: string[] }>;
  timelineSummaries: Array<{ kind: string; summary: string; id: string }>;
};
