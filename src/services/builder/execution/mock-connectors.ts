/**
 * Test-only connectors. Deterministic data; never used in production paths.
 */

import { assertNoTestAdaptersOutsideTests } from "../onboarding/beta-safety";
import {
  ConnectorError,
  type CalendarBrief,
  type CalendarConflict,
  type CalendarConnector,
  type CalendarEventSummary,
  type CalendarTimeSuggestion,
  type ConnectionStatus,
  type ConnectorSuite,
  type CrmConnector,
  type CrmRecord,
  type CrmUpdatePreview,
  type DriveConnector,
  type DriveDocument,
  type GmailConnector,
  type GmailMessageSummary,
  type GmailReplyDraft,
  type GmailThreadSummary,
  type WriteResult,
} from "./types";

type MockState = {
  inboxRevision: number;
  calendarRevision: number;
  crmRevision: number;
  driveRevision: number;
  writes: Map<string, WriteResult>;
};

function createState(): MockState {
  return {
    inboxRevision: 1,
    calendarRevision: 1,
    crmRevision: 1,
    driveRevision: 1,
    writes: new Map(),
  };
}

let sharedState = createState();

export function resetMockConnectorState() {
  sharedState = createState();
}

export function bumpMockRevision(
  system: "gmail" | "google_calendar" | "google_drive" | "crm"
) {
  if (system === "gmail") sharedState.inboxRevision += 1;
  if (system === "google_calendar") sharedState.calendarRevision += 1;
  if (system === "google_drive") sharedState.driveRevision += 1;
  if (system === "crm") sharedState.crmRevision += 1;
}

function status(system: ConnectionStatus["system"]): ConnectionStatus {
  return {
    system,
    connected: true,
    reason: null,
    checkedAt: new Date().toISOString(),
  };
}

function idempotentWrite(key: string, create: () => WriteResult): WriteResult {
  const existing = sharedState.writes.get(key);
  if (existing) return existing;
  const created = create();
  sharedState.writes.set(key, created);
  return created;
}

export class MockGmailConnector implements GmailConnector {
  readonly system = "gmail" as const;

  async getStatus() {
    return status("gmail");
  }

  async readInbox(input: { max?: number }): Promise<GmailMessageSummary[]> {
    const max = input.max ?? 5;
    return Array.from({ length: Math.min(max, 3) }, (_, i) => ({
      id: `msg-${sharedState.inboxRevision}-${i}`,
      threadId: `thread-${sharedState.inboxRevision}-${i}`,
      from: `customer${i}@example.com`,
      subject: `Follow-up ${i} (rev ${sharedState.inboxRevision})`,
      snippet: "Waiting on your reply",
      unanswered: true,
      important: i === 0,
      updatedAt: "2026-07-21T12:00:00.000Z",
    }));
  }

  async summarizeThread(input: { threadId: string }): Promise<GmailThreadSummary> {
    return {
      threadId: input.threadId,
      subject: `Thread ${input.threadId}`,
      summary: `Summary for ${input.threadId} at revision ${sharedState.inboxRevision}`,
      participants: ["customer@example.com", "ceo@example.com"],
      updatedAt: "2026-07-21T12:00:00.000Z",
    };
  }

  async prepareReply(input: { threadId: string; guidance?: string }): Promise<GmailReplyDraft> {
    const thread = await this.summarizeThread({ threadId: input.threadId });
    return {
      threadId: input.threadId,
      to: "customer@example.com",
      subject: `Re: ${thread.subject}`,
      body: input.guidance?.trim() || `Draft reply for ${input.threadId}`,
      inReplyToMessageId: input.threadId,
    };
  }

  async sendReply(input: {
    draft: GmailReplyDraft;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return idempotentWrite(input.idempotencyKey, () => ({
      externalReference: `gmail-sent-${input.idempotencyKey}`,
      verified: true,
      details: `Mock sent to ${input.draft.to}`,
    }));
  }
}

export class MockCalendarConnector implements CalendarConnector {
  readonly system = "google_calendar" as const;

  async getStatus() {
    return status("google_calendar");
  }

  async readSchedule(): Promise<CalendarEventSummary[]> {
    return [
      {
        id: `evt-a-${sharedState.calendarRevision}`,
        title: "Standup",
        start: "2026-07-21T09:00:00.000Z",
        end: "2026-07-21T09:30:00.000Z",
        attendees: ["team@example.com"],
        updatedAt: "2026-07-21T08:00:00.000Z",
      },
      {
        id: `evt-b-${sharedState.calendarRevision}`,
        title: "Customer call",
        start: "2026-07-21T09:15:00.000Z",
        end: "2026-07-21T10:00:00.000Z",
        attendees: ["customer@example.com"],
        updatedAt: "2026-07-21T08:00:00.000Z",
      },
    ];
  }

  async detectConflicts(): Promise<CalendarConflict[]> {
    const events = await this.readSchedule();
    return [
      {
        eventIds: events.map((e) => e.id),
        summary: `Conflict detected (rev ${sharedState.calendarRevision})`,
      },
    ];
  }

  async prepareBrief(input: { eventId: string }): Promise<CalendarBrief> {
    return {
      eventId: input.eventId,
      title: "Customer call",
      brief: `Brief for ${input.eventId}`,
    };
  }

  async suggestTimes(input: {
    durationMinutes: number;
    after: string;
  }): Promise<CalendarTimeSuggestion[]> {
    const start = new Date(input.after);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    return [
      {
        start: start.toISOString(),
        end: end.toISOString(),
        rationale: "First open slot",
      },
    ];
  }

  async createEvent(input: {
    title: string;
    start: string;
    end: string;
    attendees?: string[];
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return idempotentWrite(input.idempotencyKey, () => ({
      externalReference: `cal-created-${input.idempotencyKey}`,
      verified: true,
      details: `Created ${input.title}`,
    }));
  }

  async updateEvent(input: {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return idempotentWrite(input.idempotencyKey, () => ({
      externalReference: input.eventId,
      verified: true,
      details: `Updated ${input.eventId}`,
    }));
  }
}

export class MockDriveConnector implements DriveConnector {
  readonly system = "google_drive" as const;

  async getStatus() {
    return status("google_drive");
  }

  async generateDocument(input: {
    title: string;
    kind: "proposal" | "meeting_notes" | "quote" | "report";
    body: string;
  }) {
    return {
      title: input.title,
      kind: input.kind,
      content: `# ${input.title}\n\n${input.body}\n(rev ${sharedState.driveRevision})`,
    };
  }

  async saveFile(input: {
    title: string;
    content: string;
    mimeType?: string;
    idempotencyKey: string;
  }): Promise<WriteResult & { document: DriveDocument }> {
    const write = idempotentWrite(input.idempotencyKey, () => ({
      externalReference: `doc-${input.idempotencyKey}`,
      verified: true,
      details: `Saved ${input.title}`,
    }));
    return {
      ...write,
      document: {
        id: write.externalReference,
        name: input.title,
        mimeType: input.mimeType ?? "text/plain",
        webViewLink: `https://drive.example.test/file/${write.externalReference}`,
        updatedAt: "2026-07-21T12:00:00.000Z",
      },
    };
  }

  async shareExternal(input: {
    documentId: string;
    email: string;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return idempotentWrite(input.idempotencyKey, () => ({
      externalReference: `share-${input.idempotencyKey}`,
      verified: true,
      details: `Shared ${input.documentId} with ${input.email}`,
    }));
  }
}

export class MockCrmConnector implements CrmConnector {
  readonly system = "crm" as const;

  async getStatus() {
    return status("crm");
  }

  async readRecords(): Promise<CrmRecord[]> {
    return [
      {
        id: `acct-${sharedState.crmRevision}`,
        name: "Acme Corp",
        stage: "negotiation",
        lastContactAt: "2026-07-01T00:00:00.000Z",
        risk: "high",
        updatedAt: "2026-07-21T12:00:00.000Z",
      },
    ];
  }

  async identifyFollowUps(): Promise<CrmRecord[]> {
    return this.readRecords();
  }

  async prepareUpdate(input: { recordId: string; note: string }): Promise<CrmUpdatePreview> {
    const records = await this.readRecords();
    const record = records.find((r) => r.id === input.recordId) ?? records[0];
    if (!record) {
      throw new ConnectorError("CRM record not found.", "NOT_FOUND", { status: 404 });
    }
    return {
      recordId: record.id,
      fields: { last_note: input.note, stage: record.stage },
      rationale: `Update ${record.name}`,
    };
  }

  async writeUpdate(input: {
    preview: CrmUpdatePreview;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return idempotentWrite(input.idempotencyKey, () => ({
      externalReference: input.preview.recordId,
      verified: true,
      details: `Updated ${input.preview.recordId}`,
    }));
  }
}

export function createMockConnectorSuite(): ConnectorSuite {
  assertNoTestAdaptersOutsideTests("test");
  return {
    gmail: new MockGmailConnector(),
    calendar: new MockCalendarConnector(),
    drive: new MockDriveConnector(),
    crm: new MockCrmConnector(),
  };
}
