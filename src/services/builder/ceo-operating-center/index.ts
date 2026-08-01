/**
 * CEO Operating Center — proactive single-screen command surface.
 * Aggregates recorded HQ state only; never invents progress or blockers.
 */

export type {
  CeoCriticalAlert,
  CeoDailySummary,
  CeoDecisionItem,
  CeoInboxItem,
  CeoInboxKind,
  CeoMorningBriefing,
  CeoOperatingCenterKpi,
  CeoOperatingCenterTone,
  CeoOperatingCenterView,
  CeoRecommendedAction,
} from "./types";

export {
  buildCeoOperatingCenterView,
  buildCriticalAlerts,
  buildDailySummaryFromExecutive,
  buildDecisionCenter,
  buildLiveKpis,
  buildMorningBriefing,
  buildRecommendedNextAction,
  inboxFromApprovals,
  inboxFromLiveEmployees,
  inboxFromTimeline,
  mergeCeoInbox,
} from "./ceo-operating-center.logic";
