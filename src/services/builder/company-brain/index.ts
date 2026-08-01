/**
 * AI Company Brain — company-level executive reasoning over recorded HQ state.
 */

export type {
  CompanyBrainAnalyticsInput,
  CompanyBrainAssessments,
  CompanyBrainEvidence,
  CompanyBrainGithubInput,
  CompanyBrainInput,
  CompanyBrainView,
  ExecutiveRecommendation,
} from "./types";

export {
  analyticsToBrainInput,
  buildCompanyBrainView,
} from "./company-brain.logic";
