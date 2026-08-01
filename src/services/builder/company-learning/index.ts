/**
 * Company Learning Engine — continuous learning from recorded missions.
 */

export type {
  CompanyLearningView,
  CompanyKnowledgeStoreShape,
  EvolutionSignal,
  KnowledgeCategory,
  KnowledgeLedgerEntry,
  KnowledgeRecord,
  KnowledgeSearchHit,
  MissionLearningInput,
  MissionLessonRecord,
  PlanningKnowledgeAdvice,
} from "./types";

export {
  buildCompanyLearningView,
  buildPlanningKnowledgeAdvice,
  computeMaturityScore,
  deriveEvolutionSignals,
  deriveMissionLesson,
  searchKnowledge,
} from "./company-learning.logic";

export {
  appendEvolutionSignals,
  appendKnowledgeRecords,
  appendMissionLesson,
  getCompanyKnowledgeStore,
  hasLessonForMission,
  listEvolution,
  listKnowledge,
  listLessons,
} from "./company-learning.store";

export {
  collectCompletedOwnersFromItems,
  formatAdviceForAnalysisNotes,
  getCompanyLearningView,
  getPlanningKnowledgeAdvice,
  learnFromCompletedMission,
  observeAndLearnFromRecordedMissions,
} from "./company-learning.service";
