/**
 * Server-only Company Activity Timeline API.
 * Client components must import types from `./company-timeline.client` only.
 */

import "server-only";

export type {
  CompanyTimelineEventKind,
  CompanyTimelineEvent,
  CompanyTimelineStoreShape,
  CompanyTimelineView,
} from "./company-timeline.client";

export { COMPANY_TIMELINE_LABELS } from "./company-timeline.client";

export {
  recordCompanyTimelineEvent,
  getCompanyTimeline,
  recordWorkStateTimelineTransition,
} from "./company-timeline.service";
