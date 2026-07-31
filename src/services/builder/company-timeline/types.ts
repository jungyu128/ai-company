/**
 * Re-export client-safe timeline types for server modules.
 * Client components must import from `./company-timeline.client` (not this barrel).
 */

export type {
  CompanyTimelineEventKind,
  CompanyTimelineEvent,
  CompanyTimelineStoreShape,
  CompanyTimelineView,
} from "./company-timeline.client";

export { COMPANY_TIMELINE_LABELS } from "./company-timeline.client";
