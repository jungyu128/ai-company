/**
 * Company Health Score from operational KPIs (workspace-scoped inputs).
 */

import type {
  CompanyHealthKpis,
  CompanyHealthSnapshot,
  HealthLabel,
} from "./types";
import { newId, nowIso } from "../workspace/json-file";
import { sanitizeCeoText } from "./safety";

export type HealthInput = {
  workspaceId: string;
  activeWorkloadItems: number;
  employeeCount: number;
  overdueCount: number;
  approvalBacklog: number;
  executionsSucceeded: number;
  executionsFailed: number;
  executionsTotal: number;
  workdayCompletedRatio: number; // 0–100
  memoryAvgConfidence: number; // 0–100
  connectorsConnected: number;
  connectorsTotal: number;
  collaborationActive: number;
  missionsCompletedRecent: number;
  missionsActive: number;
  now?: string;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function computeHealthKpis(input: HealthInput): CompanyHealthKpis {
  const emp = Math.max(1, input.employeeCount);
  const loadPer = input.activeWorkloadItems / emp;
  const workload = clamp(100 - loadPer * 18);

  const overdueWork = clamp(100 - input.overdueCount * 12);
  const approvalBacklog = clamp(100 - input.approvalBacklog * 8);

  const execTotal = Math.max(0, input.executionsTotal);
  const executionSuccessRate =
    execTotal === 0
      ? 70
      : clamp(
          (input.executionsSucceeded / execTotal) * 100 -
            input.executionsFailed * 2
        );

  const workdayCompletion = clamp(input.workdayCompletedRatio);
  const memoryConfidence = clamp(input.memoryAvgConfidence || 55);

  const connectorHealth =
    input.connectorsTotal === 0
      ? 50
      : clamp((input.connectorsConnected / input.connectorsTotal) * 100);

  const collaborationQuality = clamp(
    55 + input.collaborationActive * 8 - input.overdueCount * 3
  );

  const missionThroughput = clamp(
    40 +
      input.missionsCompletedRecent * 10 -
      Math.max(0, input.missionsActive - emp) * 4
  );

  return {
    workload,
    overdueWork,
    approvalBacklog,
    executionSuccessRate,
    workdayCompletion,
    memoryConfidence,
    connectorHealth,
    collaborationQuality,
    missionThroughput,
  };
}

export function scoreFromKpis(kpis: CompanyHealthKpis): {
  score: number;
  label: HealthLabel;
} {
  const score = clamp(
    kpis.workload * 0.14 +
      kpis.overdueWork * 0.12 +
      kpis.approvalBacklog * 0.12 +
      kpis.executionSuccessRate * 0.14 +
      kpis.workdayCompletion * 0.1 +
      kpis.memoryConfidence * 0.08 +
      kpis.connectorHealth * 0.1 +
      kpis.collaborationQuality * 0.1 +
      kpis.missionThroughput * 0.1
  );

  const label: HealthLabel =
    score >= 80 ? "Strong" : score >= 65 ? "Stable" : score >= 45 ? "Watch" : "At risk";

  return { score, label };
}

export function buildHealthSnapshot(input: HealthInput): CompanyHealthSnapshot {
  const kpis = computeHealthKpis(input);
  const { score, label } = scoreFromKpis(kpis);
  const factors = [
    `Workload capacity ${kpis.workload}%`,
    `Execution success ${kpis.executionSuccessRate}%`,
    `Approval backlog health ${kpis.approvalBacklog}%`,
    `Connector health ${kpis.connectorHealth}%`,
    `Mission throughput ${kpis.missionThroughput}%`,
  ];

  const summary =
    label === "Strong"
      ? "The company is operating with strong coverage across employees and systems."
      : label === "Stable"
        ? "Operations are steady. A few areas need light attention."
        : label === "Watch"
          ? "Watch items are rising — clear approvals and overloaded employees first."
          : "Company health is under pressure. Address critical risks before expanding work.";

  return {
    id: newId("health"),
    workspaceId: input.workspaceId,
    score,
    label,
    summary: sanitizeCeoText(summary),
    kpis,
    factors,
    createdAt: input.now ?? nowIso(),
  };
}
