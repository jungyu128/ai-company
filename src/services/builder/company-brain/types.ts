/**
 * AI Company Brain — company-level reasoning over recorded HQ state.
 * Does not replace employees. Never fabricates progress, meetings, or blockers.
 */

export type CompanyBrainEvidence = {
  /** Recorded subsystem that supplied the fact. */
  source: string;
  fact: string;
};

export type CompanyBrainAssessments = {
  highestCompanyPriority: string | null;
  biggestCurrentRisk: string | null;
  biggestBlocker: string | null;
  weakestSprint: string | null;
  strongestOpportunity: string | null;
  recommendedNextMission: string | null;
  recommendedCeoDecision: string | null;
  workloadImbalance: string | null;
  engineeringHealth: string | null;
  releaseReadiness: string | null;
  roadmapImpact: string | null;
};

export type ExecutiveRecommendation = {
  executiveSummary: string;
  whyThisMatters: string;
  evidence: CompanyBrainEvidence[];
  risks: string[];
  recommendedAction: string;
  expectedImpact: string;
  /** 0–100; derived from how many recorded sources support the recommendation. */
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
};

export type CompanyBrainView = {
  generatedAt: string;
  generatedAtDisplay: string;
  /** Subsystems successfully observed for this cycle. */
  observedSources: string[];
  assessments: CompanyBrainAssessments;
  recommendation: ExecutiveRecommendation;
};

/** GitHub connection facts available to the Brain (optional). */
export type CompanyBrainGithubInput = {
  connected: boolean;
  tokenConfigured: boolean;
  owner: string;
  repo: string;
  error: string | null;
  pushedAt: string | null;
};

export type CompanyBrainAnalyticsInput = {
  healthScore: number;
  blockedWorkCount: number;
  sprintVelocity: number;
  qaPassRatePercent: number | null;
  activeWorkCount: number;
  completedWorkCount: number;
  recurringBlockers: Array<{ label: string; count: number }>;
  /** Employee active-work counts for imbalance detection. */
  employeeActive: Array<{ name: string; active: number; blocked: number }>;
};

export type CompanyBrainInput = {
  generatedAt: string;
  generatedAtDisplay: string;
  directive: {
    title: string;
    status: string;
    instruction: string;
    paused: boolean;
  } | null;
  companyHealth: {
    score: number;
    label: string;
    summary: string;
    factors: string[];
  };
  executiveHealthScore: number | null;
  executionSuccessRate: number | null;
  risks: string[];
  opportunities: string[];
  blockers: Array<{ title: string; reason: string }>;
  approvalQueue: {
    count: number;
    protectedCount: number;
    topTitles: string[];
  };
  ceoInbox: {
    waitingCount: number;
    blockerCount: number;
    total: number;
  };
  sprint: {
    name: string;
    goal: string;
    status: string;
    progressPercent: number;
    blockedWorkItems: number;
    completedWorkItems: number;
    totalWorkItems: number;
    velocity: number;
  } | null;
  meetings: Array<{ title: string; status: string; synthesis: string }>;
  memory: {
    insightCount: number;
    preferenceCount: number;
    lastLearnedAt: string | null;
  };
  liveWork: {
    working: number;
    blocked: number;
    waiting: number;
    reviewing: number;
    idle: number;
    overloadedNames: string[];
  };
  continuousOs: {
    running: boolean;
    lastTickAt: string | null;
    activeTaskCount: number;
    recentDecisionCount: number;
  } | null;
  timelineRecent: Array<{ kind: string; summary: string }>;
  analytics: CompanyBrainAnalyticsInput | null;
  github: CompanyBrainGithubInput | null;
  employeeRecommendations: Array<{
    title: string;
    status: string;
    summary: string;
  }>;
  metrics: {
    employeesWorking: number;
    waitingForApproval: number;
    completedToday: number;
    companyProductivity: number;
  };
  executiveBrief: {
    headline: string;
    summary: string;
    recommendedNextAction: string | null;
  };
  dailyOpsLatestUpdate: string | null;
};
