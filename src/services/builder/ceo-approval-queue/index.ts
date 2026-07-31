/**
 * Server-only CEO Approval Queue API.
 * Client components must import types from `./types` only.
 */

import "server-only";

export type {
  CeoApprovalQueueSource,
  CeoApprovalQueueDecision,
  CeoApprovalQueueEmployee,
  CeoApprovalQueueItem,
  CeoApprovalQueueView,
} from "./types";

export {
  listCeoApprovalQueue,
  decideCeoApprovalQueueItem,
} from "./ceo-approval-queue.service";
