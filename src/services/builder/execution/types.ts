/**
 * AI Company Execution Layer — typed contracts for external work systems.
 * No secrets, no UI, no Builder Runtime terminology.
 */

export type ExternalSystem = "gmail" | "google_calendar" | "google_drive" | "crm";

export type ConnectionStatus = {
  system: ExternalSystem;
  connected: boolean;
  /** User-facing reason when disconnected. Never includes secrets. */
  reason: string | null;
  checkedAt: string;
};

export type ConnectorErrorCode =
  | "DISCONNECTED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TRANSIENT"
  | "VALIDATION"
  | "CONFLICT"
  | "UNKNOWN";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    message: string,
    code: ConnectorErrorCode,
    options?: { retryable?: boolean; status?: number }
  ) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.retryable = options?.retryable ?? (code === "TRANSIENT" || code === "RATE_LIMITED");
    this.status = options?.status ?? (code === "DISCONNECTED" ? 503 : 400);
  }
}

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  unanswered: boolean;
  important: boolean;
  updatedAt: string;
};

export type GmailThreadSummary = {
  threadId: string;
  subject: string;
  summary: string;
  participants: string[];
  updatedAt: string;
};

export type GmailReplyDraft = {
  threadId: string;
  to: string;
  subject: string;
  body: string;
  inReplyToMessageId: string;
};

export type CalendarEventSummary = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  updatedAt: string;
};

export type CalendarConflict = {
  eventIds: string[];
  summary: string;
};

export type CalendarBrief = {
  eventId: string;
  title: string;
  brief: string;
};

export type CalendarTimeSuggestion = {
  start: string;
  end: string;
  rationale: string;
};

export type DriveDocument = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  updatedAt: string;
};

export type CrmRecord = {
  id: string;
  name: string;
  stage: string;
  lastContactAt: string | null;
  risk: "none" | "low" | "medium" | "high";
  updatedAt: string;
};

export type CrmUpdatePreview = {
  recordId: string;
  fields: Record<string, string>;
  rationale: string;
};

export type WriteResult = {
  externalReference: string;
  verified: boolean;
  details: string;
};

export interface GmailConnector {
  readonly system: "gmail";
  getStatus(): Promise<ConnectionStatus>;
  readInbox(input: { max?: number }): Promise<GmailMessageSummary[]>;
  summarizeThread(input: { threadId: string }): Promise<GmailThreadSummary>;
  prepareReply(input: { threadId: string; guidance?: string }): Promise<GmailReplyDraft>;
  /** WRITE — requires CEO approval upstream. */
  sendReply(input: {
    draft: GmailReplyDraft;
    idempotencyKey: string;
  }): Promise<WriteResult>;
}

export interface CalendarConnector {
  readonly system: "google_calendar";
  getStatus(): Promise<ConnectionStatus>;
  readSchedule(input: { from: string; to: string }): Promise<CalendarEventSummary[]>;
  detectConflicts(input: { from: string; to: string }): Promise<CalendarConflict[]>;
  prepareBrief(input: { eventId: string }): Promise<CalendarBrief>;
  suggestTimes(input: { durationMinutes: number; after: string }): Promise<CalendarTimeSuggestion[]>;
  /** WRITE — requires CEO approval upstream. */
  createEvent(input: {
    title: string;
    start: string;
    end: string;
    attendees?: string[];
    idempotencyKey: string;
  }): Promise<WriteResult>;
  /** WRITE — requires CEO approval upstream. */
  updateEvent(input: {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    idempotencyKey: string;
  }): Promise<WriteResult>;
}

export interface DriveConnector {
  readonly system: "google_drive";
  getStatus(): Promise<ConnectionStatus>;
  generateDocument(input: {
    title: string;
    kind: "proposal" | "meeting_notes" | "quote" | "report";
    body: string;
  }): Promise<{ content: string; title: string; kind: string }>;
  /** WRITE — requires CEO approval upstream. */
  saveFile(input: {
    title: string;
    content: string;
    mimeType?: string;
    idempotencyKey: string;
  }): Promise<WriteResult & { document: DriveDocument }>;
  /** WRITE — never without CEO approval. */
  shareExternal(input: {
    documentId: string;
    email: string;
    idempotencyKey: string;
  }): Promise<WriteResult>;
}

export interface CrmConnector {
  readonly system: "crm";
  getStatus(): Promise<ConnectionStatus>;
  readRecords(input: { query?: string; max?: number }): Promise<CrmRecord[]>;
  identifyFollowUps(): Promise<CrmRecord[]>;
  prepareUpdate(input: { recordId: string; note: string }): Promise<CrmUpdatePreview>;
  /** WRITE — requires CEO approval upstream. */
  writeUpdate(input: {
    preview: CrmUpdatePreview;
    idempotencyKey: string;
  }): Promise<WriteResult>;
}

export type ConnectorSuite = {
  gmail: GmailConnector;
  calendar: CalendarConnector;
  drive: DriveConnector;
  crm: CrmConnector;
};

export type ExecutionActionKind =
  | "gmail.prepare_reply"
  | "gmail.send_reply"
  | "calendar.create_event"
  | "calendar.update_event"
  | "drive.save_file"
  | "drive.share_external"
  | "crm.write_update"
  | "gmail.read_preview"
  | "calendar.read_preview"
  | "drive.generate_preview"
  | "crm.read_preview";

export const WRITE_ACTIONS = new Set<ExecutionActionKind>([
  "gmail.send_reply",
  "calendar.create_event",
  "calendar.update_event",
  "drive.save_file",
  "drive.share_external",
  "crm.write_update",
]);

export type ExecutionPreviewPayload = {
  summary: string;
  details: Record<string, unknown>;
  /** Snapshot used for stale-data detection. */
  sourceSnapshot: Record<string, unknown>;
};

export type ExecutionRecordStatus =
  | "preview_ready"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "stale"
  | "executing"
  | "succeeded"
  | "failed"
  | "disconnected";

export type ExecutionRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  missionId: string | null;
  system: ExternalSystem;
  action: ExecutionActionKind;
  requestedAction: string;
  preview: ExecutionPreviewPayload;
  /** Original prepare inputs — used for stale-data re-fetch. */
  prepareParams: Record<string, unknown>;
  dataFingerprint: string;
  status: ExecutionRecordStatus;
  approvalDecision: "approve" | "reject" | null;
  ceoNote: string | null;
  executionStatus: "not_started" | "succeeded" | "failed" | "skipped";
  externalReference: string | null;
  verificationResult: string | null;
  errorDetails: string | null;
  idempotencyKey: string;
  connection: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  executedAt: string | null;
};

export function employeeSystemFor(employeeId: string): ExternalSystem | null {
  switch (employeeId) {
    case "emma":
      return "gmail";
    case "alex":
      return "google_calendar";
    case "david":
      return "google_drive";
    case "sarah":
    case "noah":
      return "crm";
    default:
      return null;
  }
}

/** Default external write action for an employee after preview. */
export function defaultWriteActionForEmployee(
  employeeId: string
): ExecutionActionKind | null {
  const system = employeeSystemFor(employeeId);
  if (!system) return null;
  switch (system) {
    case "gmail":
      return "gmail.send_reply";
    case "google_calendar":
      return "calendar.create_event";
    case "google_drive":
      return "drive.save_file";
    case "crm":
      return "crm.write_update";
  }
}
