/**
 * Cursor AI Team — Runtime controller (Phase C4 + Stage 4 + Stage 5 Daily Ops)
 * Validates dispatch, transitions, approval checkpoints, session locks, and daily ops.
 */

import {
  AGENT_ROLES,
  AGENT_STATES,
  advanceTask,
  canDispatchAgentTransition,
  canMarkDone,
  canRecordCeoApproval,
  canRolePerformAction,
  canTransitionAgentState,
  canTransitionTaskStatus,
  cancelTask,
  formatAuditLine,
  isAgentAvailable,
  isTerminalTaskStatus,
  requiresCeoApproval,
  validateCeoApprovalPhrase,
  validateCeoTaskInput,
  validateDiscussionRecord,
  validateDispatch,
} from "./runtime-core.mjs";
import {
  RELEASE_CHECK_KEYS,
  buildDailyCeoBriefing,
  buildWeeklyEngineeringReport,
  formatDailyBriefingMarkdown,
  formatDecisionMemoryMarkdown,
  formatWeeklyReportMarkdown,
  prioritizeTechDebt,
  proposeImprovements,
  validateDecisionMemory,
  validateImprovementProposal,
  validateReleaseChecklist,
  validateSprintPlan,
  validateTechDebtItem,
} from "./runtime-ops.mjs";
import { buildAiCompanyHq, formatAiCompanyHqMarkdown } from "./runtime-hq.mjs";
import { buildCeoAdvisor } from "./runtime-ceo-advisor.mjs";

export {
  AGENT_ROLES,
  AGENT_STATES,
  RELEASE_CHECK_KEYS,
  advanceTask,
  buildAiCompanyHq,
  buildCeoAdvisor,
  buildDailyCeoBriefing,
  buildWeeklyEngineeringReport,
  canDispatchAgentTransition,
  canMarkDone,
  canRecordCeoApproval,
  canRolePerformAction,
  canTransitionAgentState,
  canTransitionTaskStatus,
  cancelTask,
  formatAiCompanyHqMarkdown,
  formatAuditLine,
  formatDailyBriefingMarkdown,
  formatDecisionMemoryMarkdown,
  formatWeeklyReportMarkdown,
  isAgentAvailable,
  isTerminalTaskStatus,
  prioritizeTechDebt,
  proposeImprovements,
  requiresCeoApproval,
  validateCeoApprovalPhrase,
  validateCeoTaskInput,
  validateDecisionMemory,
  validateDiscussionRecord,
  validateDispatch,
  validateImprovementProposal,
  validateReleaseChecklist,
  validateSprintPlan,
  validateTechDebtItem,
};

export function createRuntimeSession(sessionId) {
  const audit = [];
  let seq = 0;
  /** Stage 4 — mutual exclusion between advance and cancel. */
  let advanceInProgress = false;

  return {
    sessionId,
    isAdvanceInProgress() {
      return advanceInProgress;
    },
    /**
     * Hold the advance lock across multi-step orchestrator work.
     * cancelTask must reject while this lock is held.
     */
    beginAdvance(taskId) {
      if (advanceInProgress) {
        const denied = {
          ok: false,
          code: "ADVANCE_IN_PROGRESS",
          message: "Another advance is already in progress for this session",
        };
        this.recordAudit({
          actorType: "ORCHESTRATOR",
          actorId: "runtime",
          taskId,
          action: "ADVANCE_LOCK_DENIED",
          before: { advanceInProgress: true },
          after: {},
          rationale: denied.message,
        });
        return denied;
      }
      advanceInProgress = true;
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId,
        action: "ADVANCE_LOCK_ACQUIRED",
        before: { advanceInProgress: false },
        after: { advanceInProgress: true },
        rationale: "Advance lock acquired",
      });
      return { ok: true, message: "Advance lock acquired" };
    },
    endAdvance(taskId) {
      advanceInProgress = false;
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId,
        action: "ADVANCE_LOCK_RELEASED",
        before: { advanceInProgress: true },
        after: { advanceInProgress: false },
        rationale: "Advance lock released",
      });
      return { ok: true, message: "Advance lock released" };
    },
    recordAudit(entry) {
      seq += 1;
      const full = {
        auditId: entry.auditId ?? `AUD-${sessionId}-${String(seq).padStart(4, "0")}`,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        ...entry,
      };
      audit.push(full);
      return full;
    },
    getAudit() {
      return [...audit];
    },
    dispatch(input) {
      const result = validateDispatch(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: input.taskId,
        action: result.ok ? "DISPATCH_APPROVED" : "DISPATCH_DENIED",
        before: {
          agentState: input.agentState,
          currentTaskId: input.currentTaskId ?? null,
          taskStatus: input.taskStatus,
        },
        after: result.ok ? { agentState: result.nextAgentState, currentTaskId: input.taskId } : {},
        rationale: result.message,
      });
      return result;
    },
    transitionAgent({ role, from, to, taskId, rationale }) {
      const ok = canTransitionAgentState(from, to);
      this.recordAudit({
        actorType: "AI_ROLE",
        actorId: role,
        taskId,
        action: ok ? "AGENT_TRANSITION" : "AGENT_TRANSITION_DENIED",
        before: { state: from },
        after: { state: to },
        rationale,
      });
      return ok;
    },
    transitionTask({ actorId, from, to, taskId, rationale }) {
      const ok = canTransitionTaskStatus(from, to);
      this.recordAudit({
        actorType: "AI_ROLE",
        actorId,
        taskId,
        action: ok ? "TASK_TRANSITION" : "TASK_TRANSITION_DENIED",
        before: { status: from },
        after: { status: to },
        rationale,
      });
      return ok;
    },
    /**
     * Stage 4 — advance with session lock (cancel cannot run concurrently).
     * If beginAdvance already holds the lock, advance under that lock and do not release it.
     * If no lock is held, acquire for this call and release in finally.
     */
    advanceTask(input) {
      const held = advanceInProgress;
      if (!held) {
        const lock = this.beginAdvance(input?.taskId);
        if (!lock.ok) {
          return lock;
        }
      }
      try {
        const result = advanceTask({
          ...input,
          advanceInProgress: false,
        });
        this.recordAudit({
          actorType: "ORCHESTRATOR",
          actorId: "runtime",
          taskId: input?.taskId,
          action: result.ok ? "ADVANCE_APPROVED" : "ADVANCE_DENIED",
          before: { status: input?.from },
          after: result.ok ? { status: input?.to } : {},
          rationale: result.message,
        });
        return result;
      } finally {
        if (!held) {
          this.endAdvance(input?.taskId);
        }
      }
    },
    /**
     * Stage 4 — cancel rejected while advanceInProgress or terminal.
     */
    cancelTask(input) {
      const result = cancelTask({
        ...input,
        advanceInProgress,
      });
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: input?.taskId,
        action: result.ok ? "CANCEL_APPROVED" : "CANCEL_DENIED",
        before: { status: input?.from, advanceInProgress },
        after: result.ok ? { status: "CANCELLED" } : {},
        rationale: result.message,
      });
      return result;
    },
    validateCeoTaskInput(input) {
      const result = validateCeoTaskInput(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: input?.taskId,
        action: result.ok ? "TASK_INPUT_VALID" : "TASK_INPUT_INVALID",
        before: {},
        after: result.ok ? { taskId: result.value.taskId } : { errors: result.errors },
        rationale: result.message,
      });
      return result;
    },
    validateDiscussion(record) {
      const result = validateDiscussionRecord(record);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: record?.taskId,
        action: result.ok ? "DISCUSSION_VALID" : "DISCUSSION_INVALID",
        before: {},
        after: {},
        rationale: result.message,
      });
      return result;
    },
    recordCeoApproval({ taskStatus, phrase, expectedTaskId, taskId }) {
      const result = canRecordCeoApproval({ taskStatus, phrase, expectedTaskId: expectedTaskId ?? taskId });
      this.recordAudit({
        actorType: "CEO",
        actorId: "ceo",
        taskId: expectedTaskId ?? taskId,
        action: result.ok ? "CEO_APPROVAL" : "CEO_APPROVAL_DENIED",
        before: { taskStatus },
        after: result.ok ? { gate: result.gate, phrase } : {},
        rationale: result.message,
      });
      return result;
    },
    // --- Stage 5 Daily Operations (artifacts under docs/ai-team/ops/) ---
    buildDailyCeoBriefing(input) {
      const result = buildDailyCeoBriefing(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: null,
        action: result.ok ? "DAILY_BRIEFING_BUILT" : "DAILY_BRIEFING_DENIED",
        before: {},
        after: result.ok ? { date: result.value.date, blocked: result.value.blocked.length } : {},
        rationale: result.message,
      });
      return result;
    },
    validateSprintPlan(plan) {
      const result = validateSprintPlan(plan);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: null,
        action: result.ok ? "SPRINT_PLAN_VALID" : "SPRINT_PLAN_INVALID",
        before: {},
        after: result.ok ? { sprintId: result.value.sprintId } : { errors: result.errors },
        rationale: result.message,
      });
      return result;
    },
    validateDecisionMemory(entry) {
      const result = validateDecisionMemory(entry);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: entry?.taskId ?? null,
        action: result.ok ? "DECISION_MEMORY_VALID" : "DECISION_MEMORY_INVALID",
        before: {},
        after: result.ok ? { decisionId: result.value.decisionId } : { errors: result.errors },
        rationale: result.message,
      });
      return result;
    },
    proposeImprovements(input) {
      const result = proposeImprovements(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: null,
        action: result.ok ? "IMPROVEMENTS_PROPOSED" : "IMPROVEMENTS_DENIED",
        before: {},
        after: result.ok ? { count: result.value.proposals.length } : {},
        rationale: result.message,
      });
      return result;
    },
    buildWeeklyEngineeringReport(input) {
      const result = buildWeeklyEngineeringReport(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: null,
        action: result.ok ? "WEEKLY_REPORT_BUILT" : "WEEKLY_REPORT_DENIED",
        before: {},
        after: result.ok ? { weekOf: result.value.weekOf } : {},
        rationale: result.message,
      });
      return result;
    },
    validateReleaseChecklist(checklist) {
      const result = validateReleaseChecklist(checklist);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: checklist?.taskId ?? null,
        action: result.ok ? "RELEASE_CHECKLIST_VALID" : "RELEASE_CHECKLIST_INVALID",
        before: {},
        after: result.ok
          ? { taskId: result.value.taskId, ready: result.value.ready }
          : { errors: result.errors },
        rationale: result.message,
      });
      return result;
    },
    validateTechDebtItem(item) {
      const result = validateTechDebtItem(item);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: item?.relatedTaskId ?? null,
        action: result.ok ? "TECH_DEBT_VALID" : "TECH_DEBT_INVALID",
        before: {},
        after: result.ok ? { debtId: result.value.debtId, severity: result.value.severity } : { errors: result.errors },
        rationale: result.message,
      });
      return result;
    },
    prioritizeTechDebt(items) {
      return prioritizeTechDebt(items);
    },
    /** HQ entry — Builder Runtime state for CEO (no product/customer data). */
    buildAiCompanyHq(input) {
      const result = buildAiCompanyHq(input);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: result.ok ? result.value.currentTask?.id ?? null : null,
        action: result.ok ? "HQ_BUILT" : "HQ_DENIED",
        before: {},
        after: result.ok
          ? {
              sprintId: result.value.sprint?.id ?? null,
              waitingCeo: result.value.pendingCeoApprovals.length,
            }
          : {},
        rationale: result.message,
      });
      return result;
    },
    buildCeoAdvisor(hq, opts) {
      const result = buildCeoAdvisor(hq, opts);
      this.recordAudit({
        actorType: "ORCHESTRATOR",
        actorId: "runtime",
        taskId: hq?.currentTask?.id ?? null,
        action: result.ok ? "CEO_ADVISOR_BUILT" : "CEO_ADVISOR_DENIED",
        before: { lastVisitAt: opts?.lastVisitAt ?? null },
        after: result.ok ? { urgency: result.value.urgency } : {},
        rationale: result.message,
      });
      return result;
    },
  };
}
