/**
 * Autonomous AI software company — WorkPilot development domain types.
 * Mission: build and improve WorkPilot only.
 */

export type WorkItemKind =
  | "feature"
  | "task"
  | "pull_request"
  | "bug"
  | "document"
  | "roadmap";

/** Every conversation / report must attach to a real WorkPilot work item. */
export type WorkItemLink = {
  kind: WorkItemKind;
  id: string;
  title: string;
  url?: string | null;
  /** Human refs e.g. TASK-…, PR#12, MILE-… */
  refs: string[];
};

export type DevDiscipline =
  | "frontend"
  | "backend"
  | "ai"
  | "qa"
  | "devops"
  | "product"
  | "design"
  | "architecture"
  | "ceo_advisor";

export type DevTaskStatus =
  | "proposed"
  | "blocked"
  | "in_progress"
  | "needs_clarification"
  | "peer_review"
  | "awaiting_ceo"
  | "done";

export type DevTask = {
  id: string;
  title: string;
  description: string;
  ownerEmployeeId: string;
  collaboratorIds: string[];
  discipline: DevDiscipline;
  status: DevTaskStatus;
  workItem: WorkItemLink;
  /** Missing requirements that must be asked of the CEO — never assumed. */
  missingRequirements: string[];
  progressNote: string | null;
  blocker: string | null;
  improvementProposal: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PeerDiscussionTurn = {
  employeeId: string;
  employeeName: string;
  role: string;
  body: string;
  at: string;
};

export type PeerDiscussion = {
  id: string;
  workItem: WorkItemLink;
  participantIds: string[];
  turns: PeerDiscussionTurn[];
  synthesis: string;
  createdAt: string;
};

export type CeoDevReportKind =
  | "completed_report"
  | "architecture_proposal"
  | "bug_report"
  | "code_review_request"
  | "deployment_approval"
  | "product_recommendation"
  | "clarification_request"
  | "progress_update"
  | "blocker"
  | "repo_change";

export type CeoDevReport = {
  id: string;
  kind: CeoDevReportKind;
  employeeId: string;
  employeeName: string;
  title: string;
  body: string;
  workItem: WorkItemLink;
  peerDiscussionId: string | null;
  taskId: string | null;
  requiresCeoDecision: boolean;
  createdAt: string;
  deliveredToChat: boolean;
};

export type RepoSnapshot = {
  capturedAt: string;
  connected: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  openIssueNumbers: number[];
  openPrNumbers: number[];
  issueTitles: Record<string, string>;
  prTitles: Record<string, string>;
  prDraft: Record<string, boolean>;
  error: string | null;
};

export type RepoChangeEvent = {
  id: string;
  at: string;
  summary: string;
  workItem: WorkItemLink;
  severity: "info" | "attention";
  ownerEmployeeId: string;
};

export type AutonomyCycleResult = {
  tasksCreated: DevTask[];
  discussions: PeerDiscussion[];
  reports: CeoDevReport[];
  repoChanges: RepoChangeEvent[];
  chatDeliveries: Array<{ employeeId: string; reportId: string }>;
};
