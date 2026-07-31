/**
 * Server-only Daily Report API.
 * Client components must import types from `./types` only.
 */

import "server-only";

export type {
  DailyReportWorkEntry,
  DailyReportBlockerEntry,
  DailyReportApprovalEntry,
  DailyReportReviewEntry,
  DailyReportRiskEntry,
  DailyReportBody,
  DailyReportView,
} from "./types";

export {
  getLatestDailyReportView,
  previewDailyReport,
  dailyReportViewFromStored,
} from "./daily-report.service";
