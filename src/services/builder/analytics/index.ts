export type {
  AnalyticsDimension,
  TrendPoint,
  EmployeeProductivity,
  WorkDistributionSlice,
  RecurringBlocker,
  CompanyAnalyticsKpis,
  CompanyAnalyticsSnapshot,
  AnalyticsHistorySample,
  CompanyAnalyticsView,
} from "./types";

export {
  computeEmployeeProductivity,
  computeWorkDistribution,
  computeRecurringBlockers,
  computeMeetingEfficiency,
  computeApprovalTurnaround,
  computeQaRates,
  computeAvgCompletionHours,
  deriveAnalyticsHealthScore,
  buildCompanyAnalyticsSnapshot,
  filterTasksForDimension,
  healthLabelFromScore,
} from "./analytics.logic";

export {
  computeCompanyAnalyticsSnapshot,
  recordCompanyAnalyticsSample,
  getCompanyAnalyticsView,
} from "./analytics.service";
