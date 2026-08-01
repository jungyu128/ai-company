/**
 * AI Company Work Execution Engine — lifecycle monitor (observe recorded state only).
 */

export type {
  WorkExecutionEngineView,
  WorkExecutionItemView,
  WorkLifecycleStage,
  WorkLifecycleStageId,
  WorkLifecycleStageStatus,
  WorkpilotLifecycleLink,
} from "./types";

export {
  buildCollaborationNotes,
  buildLifecycleStages,
  buildWorkExecutionEngineView,
  toWorkExecutionItemView,
} from "./work-execution-engine.logic";

export { getWorkExecutionEngineView } from "./work-execution-engine.service";
