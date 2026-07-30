/**
 * Live connectors — real credentials required.
 * Never returns fake success when disconnected.
 *
 * Phased rollout (v5):
 * 1. Architecture + mocks + approval
 * 2. Gmail live
 * 3. Google Calendar live
 * 4. Google Drive live
 * 5. CRM interface only (DeferredCrmConnector) — live vendor deferred
 */

import {
  ConnectorError,
  type CalendarBrief,
  type CalendarConflict,
  type CalendarConnector,
  type CalendarEventSummary,
  type CalendarTimeSuggestion,
  type ConnectionStatus,
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

/** Process-local write cache for idempotent retries (never persists tokens). */
const liveWriteCache = new Map<string, WriteResult>();

function cachedWrite(idempotencyKey: string, create: () => Promise<WriteResult>): Promise<WriteResult> {
  const hit = liveWriteCache.get(idempotencyKey);
  if (hit) return Promise.resolve(hit);
  return create().then((result) => {
    liveWriteCache.set(idempotencyKey, result);
    return result;
  });
}

function nowIso() {
  return new Date().toISOString();
}

function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim()
  );
}

function disconnected(system: ConnectionStatus["system"], reason: string): ConnectionStatus {
  return { system, connected: false, reason, checkedAt: nowIso() };
}

function connected(system: ConnectionStatus["system"]): ConnectionStatus {
  return { system, connected: true, reason: null, checkedAt: nowIso() };
}

async function requireGoogleAccess(system: ConnectionStatus["system"]): Promise<string> {
  if (!googleConfigured()) {
    throw new ConnectorError(
      `${systemLabel(system)} is disconnected. Connect Google OAuth credentials in settings.`,
      "DISCONNECTED",
      { status: 503 }
    );
  }
  // Live token refresh — fail clearly if Google rejects credentials.
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new ConnectorError(
      `${systemLabel(system)} authentication failed. Reconnect Google and verify credentials.`,
      "PERMISSION_DENIED",
      { status: 401 }
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ConnectorError(
      `${systemLabel(system)} did not return an access token.`,
      "PERMISSION_DENIED",
      { status: 401 }
    );
  }
  return json.access_token;
}

function systemLabel(system: ConnectionStatus["system"]) {
  switch (system) {
    case "gmail":
      return "Gmail";
    case "google_calendar":
      return "Google Calendar";
    case "google_drive":
      return "Google Drive";
    case "crm":
      return "CRM";
  }
}

export class LiveGmailConnector implements GmailConnector {
  readonly system = "gmail" as const;

  async getStatus(): Promise<ConnectionStatus> {
    if (!googleConfigured() || process.env.AI_COMPANY_GMAIL_ENABLED === "false") {
      return disconnected(
        "gmail",
        "Gmail disconnected. Enable AI_COMPANY_GMAIL_ENABLED and configure Google OAuth refresh credentials."
      );
    }
    try {
      await requireGoogleAccess("gmail");
      return connected("gmail");
    } catch (err) {
      return disconnected(
        "gmail",
        err instanceof Error ? err.message : "Gmail disconnected."
      );
    }
  }

  async readInbox(input: { max?: number }): Promise<GmailMessageSummary[]> {
    const token = await requireGoogleAccess("gmail");
    const max = Math.min(input.max ?? 10, 25);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=in:inbox`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new ConnectorError("Unable to read Gmail inbox.", "TRANSIENT", {
        retryable: true,
        status: res.status,
      });
    }
    const json = (await res.json()) as { messages?: Array<{ id: string; threadId: string }> };
    const messages: GmailMessageSummary[] = [];
    for (const m of json.messages ?? []) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!detailRes.ok) continue;
      const detail = (await detailRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        internalDate?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const headers = detail.payload?.headers ?? [];
      const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "unknown";
      const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(no subject)";
      messages.push({
        id: detail.id,
        threadId: detail.threadId,
        from,
        subject,
        snippet: detail.snippet ?? "",
        unanswered: !(detail.labelIds ?? []).includes("SENT"),
        important: (detail.labelIds ?? []).includes("IMPORTANT"),
        updatedAt: detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : nowIso(),
      });
    }
    return messages;
  }

  async summarizeThread(input: { threadId: string }): Promise<GmailThreadSummary> {
    const token = await requireGoogleAccess("gmail");
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${input.threadId}?format=metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new ConnectorError("Thread not found in Gmail.", "NOT_FOUND", { status: 404 });
    }
    const json = (await res.json()) as {
      id: string;
      messages?: Array<{
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      }>;
    };
    const first = json.messages?.[0];
    const headers = first?.payload?.headers ?? [];
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(no subject)";
    const participants = Array.from(
      new Set(
        (json.messages ?? []).flatMap((m) =>
          (m.payload?.headers ?? [])
            .filter((h) => ["from", "to"].includes(h.name.toLowerCase()))
            .map((h) => h.value)
        )
      )
    );
    const snippets = (json.messages ?? []).map((m) => m.snippet ?? "").filter(Boolean);
    return {
      threadId: json.id,
      subject,
      summary: snippets.slice(0, 3).join(" → ") || "No message content available.",
      participants,
      updatedAt: nowIso(),
    };
  }

  async prepareReply(input: { threadId: string; guidance?: string }): Promise<GmailReplyDraft> {
    const thread = await this.summarizeThread({ threadId: input.threadId });
    const to = thread.participants[0] ?? "unknown@example.com";
    return {
      threadId: input.threadId,
      to,
      subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      body: [
        "Hi,",
        "",
        input.guidance?.trim() ||
          `Thanks for your note. ${thread.summary.slice(0, 180)}`,
        "",
        "Best regards",
      ].join("\n"),
      inReplyToMessageId: input.threadId,
    };
  }

  async sendReply(input: {
    draft: GmailReplyDraft;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return cachedWrite(input.idempotencyKey, async () => {
      const token = await requireGoogleAccess("gmail");
      const raw = [
        `To: ${input.draft.to}`,
        `Subject: ${input.draft.subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        input.draft.body,
      ].join("\r\n");
      const encoded = Buffer.from(raw)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({ raw: encoded, threadId: input.draft.threadId }),
      });
      if (!res.ok) {
        throw new ConnectorError("Gmail send failed.", "TRANSIENT", {
          retryable: true,
          status: res.status,
        });
      }
      const json = (await res.json()) as { id?: string };
      const ref = json.id ?? `gmail-send-${input.idempotencyKey}`;
      return {
        externalReference: ref,
        verified: Boolean(json.id),
        details: json.id ? `Sent message ${json.id}` : "Send accepted without message id",
      };
    });
  }
}

export class LiveCalendarConnector implements CalendarConnector {
  readonly system = "google_calendar" as const;

  async getStatus(): Promise<ConnectionStatus> {
    if (!googleConfigured() || process.env.AI_COMPANY_CALENDAR_ENABLED === "false") {
      return disconnected(
        "google_calendar",
        "Google Calendar disconnected. Enable AI_COMPANY_CALENDAR_ENABLED and configure Google OAuth refresh credentials."
      );
    }
    try {
      await requireGoogleAccess("google_calendar");
      return connected("google_calendar");
    } catch (err) {
      return disconnected(
        "google_calendar",
        err instanceof Error ? err.message : "Calendar disconnected."
      );
    }
  }

  async readSchedule(input: { from: string; to: string }): Promise<CalendarEventSummary[]> {
    const token = await requireGoogleAccess("google_calendar");
    const params = new URLSearchParams({
      timeMin: input.from,
      timeMax: input.to,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new ConnectorError("Unable to read calendar.", "TRANSIENT", {
        retryable: true,
        status: res.status,
      });
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string }>;
        updated?: string;
      }>;
    };
    return (json.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? "(untitled)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
      updatedAt: e.updated ?? nowIso(),
    }));
  }

  async detectConflicts(input: { from: string; to: string }): Promise<CalendarConflict[]> {
    const events = await this.readSchedule(input);
    const conflicts: CalendarConflict[] = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (a.start < b.end && b.start < a.end) {
          conflicts.push({
            eventIds: [a.id, b.id],
            summary: `Conflict between “${a.title}” and “${b.title}”`,
          });
        }
      }
    }
    return conflicts;
  }

  async prepareBrief(input: { eventId: string }): Promise<CalendarBrief> {
    const token = await requireGoogleAccess("google_calendar");
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${input.eventId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new ConnectorError("Calendar event not found.", "NOT_FOUND", { status: 404 });
    }
    const e = (await res.json()) as {
      id: string;
      summary?: string;
      description?: string;
      attendees?: Array<{ email?: string }>;
    };
    return {
      eventId: e.id,
      title: e.summary ?? "(untitled)",
      brief: [
        `Meeting: ${e.summary ?? "(untitled)"}`,
        e.description ? `Notes: ${e.description}` : "No description provided.",
        `Attendees: ${(e.attendees ?? []).map((a) => a.email).filter(Boolean).join(", ") || "none"}`,
      ].join("\n"),
    };
  }

  async suggestTimes(input: {
    durationMinutes: number;
    after: string;
  }): Promise<CalendarTimeSuggestion[]> {
    const start = new Date(input.after);
    const suggestions: CalendarTimeSuggestion[] = [];
    for (let i = 1; i <= 3; i++) {
      const s = new Date(start.getTime() + i * 60 * 60 * 1000);
      const e = new Date(s.getTime() + input.durationMinutes * 60_000);
      suggestions.push({
        start: s.toISOString(),
        end: e.toISOString(),
        rationale: `Open slot +${i}h from requested time`,
      });
    }
    return suggestions;
  }

  async createEvent(input: {
    title: string;
    start: string;
    end: string;
    attendees?: string[];
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return cachedWrite(input.idempotencyKey, async () => {
      const token = await requireGoogleAccess("google_calendar");
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          summary: input.title,
          start: { dateTime: input.start },
          end: { dateTime: input.end },
          attendees: (input.attendees ?? []).map((email) => ({ email })),
        }),
      });
      if (!res.ok) {
        throw new ConnectorError("Calendar create failed.", "TRANSIENT", {
          retryable: true,
          status: res.status,
        });
      }
      const json = (await res.json()) as { id?: string; htmlLink?: string };
      return {
        externalReference: json.id ?? `cal-${input.idempotencyKey}`,
        verified: Boolean(json.id),
        details: json.htmlLink ?? `Created event ${json.id}`,
      };
    });
  }

  async updateEvent(input: {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return cachedWrite(input.idempotencyKey, async () => {
      const token = await requireGoogleAccess("google_calendar");
      const patch: Record<string, unknown> = {};
      if (input.title) patch.summary = input.title;
      if (input.start) patch.start = { dateTime: input.start };
      if (input.end) patch.end = { dateTime: input.end };
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${input.eventId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey,
          },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        throw new ConnectorError("Calendar update failed.", "TRANSIENT", {
          retryable: true,
          status: res.status,
        });
      }
      const json = (await res.json()) as { id?: string };
      return {
        externalReference: json.id ?? input.eventId,
        verified: Boolean(json.id),
        details: `Updated event ${json.id ?? input.eventId}`,
      };
    });
  }
}

export class LiveDriveConnector implements DriveConnector {
  readonly system = "google_drive" as const;

  async getStatus(): Promise<ConnectionStatus> {
    if (!googleConfigured() || process.env.AI_COMPANY_DRIVE_ENABLED === "false") {
      return disconnected(
        "google_drive",
        "Google Drive disconnected. Enable AI_COMPANY_DRIVE_ENABLED and configure Google OAuth refresh credentials."
      );
    }
    try {
      await requireGoogleAccess("google_drive");
      return connected("google_drive");
    } catch (err) {
      return disconnected(
        "google_drive",
        err instanceof Error ? err.message : "Drive disconnected."
      );
    }
  }

  async generateDocument(input: {
    title: string;
    kind: "proposal" | "meeting_notes" | "quote" | "report";
    body: string;
  }) {
    return {
      title: input.title,
      kind: input.kind,
      content: `# ${input.title}\n\nType: ${input.kind}\n\n${input.body}\n`,
    };
  }

  async saveFile(input: {
    title: string;
    content: string;
    mimeType?: string;
    idempotencyKey: string;
  }): Promise<WriteResult & { document: DriveDocument }> {
    const write = await cachedWrite(input.idempotencyKey, async () => {
      const token = await requireGoogleAccess("google_drive");
      const metadata = {
        name: input.title,
        mimeType: input.mimeType ?? "text/plain",
      };
      const boundary = "workpilot_boundary";
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${metadata.mimeType}`,
        "",
        input.content,
        `--${boundary}--`,
      ].join("\r\n");
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Idempotency-Key": input.idempotencyKey,
          },
          body,
        }
      );
      if (!res.ok) {
        throw new ConnectorError("Drive save failed.", "TRANSIENT", {
          retryable: true,
          status: res.status,
        });
      }
      const json = (await res.json()) as {
        id: string;
        name: string;
        mimeType: string;
        webViewLink?: string;
        modifiedTime?: string;
      };
      return {
        externalReference: json.id,
        verified: Boolean(json.id),
        details: json.webViewLink ?? `Saved ${json.name}`,
      };
    });

    return {
      ...write,
      document: {
        id: write.externalReference,
        name: input.title,
        mimeType: input.mimeType ?? "text/plain",
        webViewLink: write.details.startsWith("http") ? write.details : null,
        updatedAt: nowIso(),
      },
    };
  }

  async shareExternal(input: {
    documentId: string;
    email: string;
    idempotencyKey: string;
  }): Promise<WriteResult> {
    return cachedWrite(input.idempotencyKey, async () => {
      const token = await requireGoogleAccess("google_drive");
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${input.documentId}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey,
          },
          body: JSON.stringify({
            type: "user",
            role: "reader",
            emailAddress: input.email,
          }),
        }
      );
      if (!res.ok) {
        throw new ConnectorError("Drive share failed.", "TRANSIENT", {
          retryable: true,
          status: res.status,
        });
      }
      const json = (await res.json()) as { id?: string };
      return {
        externalReference: json.id ?? `share-${input.idempotencyKey}`,
        verified: Boolean(json.id),
        details: `Shared with ${input.email}`,
      };
    });
  }
}

export class DeferredCrmConnector implements CrmConnector {
  readonly system = "crm" as const;

  /**
   * Phase 5 — CRM interface only. Live vendor integration is deferred.
   * Never reports connected; never returns fake success.
   */
  async getStatus(): Promise<ConnectionStatus> {
    return disconnected(
      "crm",
      "CRM live connector deferred (v5 Phase 5). Interface + mock adapters are available; connect a CRM provider in a later phase."
    );
  }

  private refuse(): never {
    throw new ConnectorError(
      "CRM live connector is deferred. Use mock adapters in tests only.",
      "DISCONNECTED",
      { status: 503 }
    );
  }

  async readRecords(): Promise<CrmRecord[]> {
    this.refuse();
  }

  async identifyFollowUps(): Promise<CrmRecord[]> {
    this.refuse();
  }

  async prepareUpdate(): Promise<CrmUpdatePreview> {
    this.refuse();
  }

  async writeUpdate(): Promise<WriteResult> {
    this.refuse();
  }
}

/** @deprecated Alias kept for imports — production CRM is deferred. */
export const LiveCrmConnector = DeferredCrmConnector;
