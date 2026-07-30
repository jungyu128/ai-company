import {
  DeferredCrmConnector,
  LiveCalendarConnector,
  LiveDriveConnector,
  LiveGmailConnector,
} from "./live-connectors";
import { createMockConnectorSuite } from "./mock-connectors";
import type { ConnectorSuite } from "./types";
import { assertNoTestAdaptersOutsideTests } from "../onboarding/beta-safety";

export type ConnectorMode = "live" | "test";

/**
 * Factory for external system adapters.
 * Production/default path is always live (disconnected until credentials exist).
 * CRM live is deferred (Phase 5) — production uses DeferredCrmConnector.
 * Test mode is opt-in and must only be used from tests.
 */
export function createConnectorSuite(mode: ConnectorMode = "live"): ConnectorSuite {
  assertNoTestAdaptersOutsideTests(mode);
  if (mode === "test") return createMockConnectorSuite();
  return {
    gmail: new LiveGmailConnector(),
    calendar: new LiveCalendarConnector(),
    drive: new LiveDriveConnector(),
    crm: new DeferredCrmConnector(),
  };
}

export async function getAllConnectionStatuses(suite: ConnectorSuite) {
  return Promise.all([
    suite.gmail.getStatus(),
    suite.calendar.getStatus(),
    suite.drive.getStatus(),
    suite.crm.getStatus(),
  ]);
}
