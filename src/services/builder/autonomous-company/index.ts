export type {
  WorkItemKind,
  WorkItemLink,
  DevDiscipline,
  DevTask,
  DevTaskStatus,
  PeerDiscussion,
  CeoDevReport,
  CeoDevReportKind,
  RepoSnapshot,
  RepoChangeEvent,
  AutonomyCycleResult,
} from "./types";

export {
  listDevOwnership,
  ownershipForEmployee,
  employeesForDiscipline,
  pickOwnerForWork,
  formatWorkItemLine,
} from "./dev-ownership.logic";

export {
  runAutonomousCompanyCycle,
  refreshAutonomousCompany,
  deliverCeoReportsToChat,
  getEmployeeDevContext,
  maybeClarificationReply,
  listCeoDevInbox,
} from "./autonomous-company.service";

export type { RepoMonitorInput } from "./autonomous-company.service";

export {
  listActiveWorkpilotMissions,
  isWithinActiveMissionScope,
  isUnrelatedCommercialComms,
  ceoExplicitlyRequestsComms,
  activeMissionsRequireComms,
  missionScopeFocusLine,
} from "./mission-scope.logic";

export {
  validateEmployeeOutput,
  roleContractForEmployee,
  isValidCollaboratorPair,
  filterValidCollaborators,
  listEmployeesWithRoleContracts,
  evaluateRoleMissionFit,
  stripMissionRoleOverrides,
} from "./employee-role.logic";

export {
  buildMissionExecutionContext,
  formatMissionExecutionContextBrief,
  extractAcceptanceCriteria,
  EXECUTION_SAFETY_RULES,
} from "./mission-execution-context.logic";

export type { MissionExecutionContext } from "./mission-execution-context.logic";

export {
  clarificationAlreadyAsked,
  detectMissingRequirements,
} from "./work-items.logic";
