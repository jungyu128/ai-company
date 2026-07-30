import type { ConnectionStatus, ExternalSystem } from "./types";

function checkedAt() {
  return new Date().toISOString();
}

function googleReady() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim()
  );
}

/** Sync connection probe for dashboards (no network). Live probes happen at prepare/execute. */
export function getConnectionStatusesSync(): ConnectionStatus[] {
  const googleSystems: Array<{
    system: ExternalSystem;
    enabledFlag: string;
    label: string;
  }> = [
    {
      system: "gmail",
      enabledFlag: "AI_COMPANY_GMAIL_ENABLED",
      label: "Gmail",
    },
    {
      system: "google_calendar",
      enabledFlag: "AI_COMPANY_CALENDAR_ENABLED",
      label: "Google Calendar",
    },
    {
      system: "google_drive",
      enabledFlag: "AI_COMPANY_DRIVE_ENABLED",
      label: "Google Drive",
    },
  ];

  const statuses: ConnectionStatus[] = googleSystems.map((s) => {
    const enabled = process.env[s.enabledFlag] !== "false";
    if (!enabled) {
      return {
        system: s.system,
        connected: false,
        reason: `${s.label} disabled (${s.enabledFlag}=false).`,
        checkedAt: checkedAt(),
      };
    }
    if (!googleReady()) {
      return {
        system: s.system,
        connected: false,
        reason: `${s.label} disconnected. Connect Google OAuth credentials in settings.`,
        checkedAt: checkedAt(),
      };
    }
    return {
      system: s.system,
      connected: true,
      reason: null,
      checkedAt: checkedAt(),
    };
  });

  // Phase 5 — CRM interface only; live vendor integration deferred.
  statuses.push({
    system: "crm",
    connected: false,
    reason:
      "CRM live connector deferred (v5 Phase 5). Interface + mock adapters are available; connect a CRM provider in a later phase.",
    checkedAt: checkedAt(),
  });

  return statuses;
}
