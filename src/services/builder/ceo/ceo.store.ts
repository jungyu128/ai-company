/**
 * Workspace-scoped AI CEO persistence.
 */

import {
  readJsonFile,
  writeJsonFile,
  workspaceFile,
} from "../workspace/json-file";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import type {
  CompanyHealthSnapshot,
  ExecutiveReport,
  KpiHistoryPoint,
  OperationalRisk,
  PlanningRecommendation,
  WorkloadEntry,
} from "./types";

export const CEO_STORE_FILE = "ai-company-ceo.json";

type CeoStoreShape = {
  healthSnapshots: CompanyHealthSnapshot[];
  kpiHistory: KpiHistoryPoint[];
  risks: OperationalRisk[];
  workloadHistory: Array<{ at: string; workloads: WorkloadEntry[] }>;
  planningHistory: PlanningRecommendation[];
  reports: ExecutiveReport[];
};

function empty(): CeoStoreShape {
  return {
    healthSnapshots: [],
    kpiHistory: [],
    risks: [],
    workloadHistory: [],
    planningHistory: [],
    reports: [],
  };
}

function pathFor(repoRoot: string, workspaceId: string) {
  return workspaceFile(repoRoot, CEO_STORE_FILE, workspaceId);
}

export function readCeoStore(
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd()
): CeoStoreShape {
  return readJsonFile(repoRoot, pathFor(repoRoot, workspaceId), empty());
}

export function writeCeoStore(
  store: CeoStoreShape,
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd()
) {
  writeJsonFile(repoRoot, pathFor(repoRoot, workspaceId), store);
}

export function persistCeoCycle(input: {
  workspaceId: string;
  health: CompanyHealthSnapshot;
  risks: OperationalRisk[];
  workloads: WorkloadEntry[];
  planning: PlanningRecommendation[];
  reports?: ExecutiveReport[];
  repoRoot?: string;
}) {
  const root = input.repoRoot ?? process.cwd();
  const store = readCeoStore(input.workspaceId, root);
  store.healthSnapshots.unshift(input.health);
  store.healthSnapshots = store.healthSnapshots.slice(0, 60);
  store.kpiHistory.unshift({
    id: `kpi-${input.health.id}`,
    workspaceId: input.workspaceId,
    at: input.health.createdAt,
    score: input.health.score,
    kpis: input.health.kpis,
  });
  store.kpiHistory = store.kpiHistory.slice(0, 120);
  store.risks = [...input.risks, ...store.risks.filter((r) => r.status !== "open")].slice(
    0,
    200
  );
  store.workloadHistory.unshift({
    at: input.health.createdAt,
    workloads: input.workloads,
  });
  store.workloadHistory = store.workloadHistory.slice(0, 60);
  store.planningHistory = [...input.planning, ...store.planningHistory].slice(0, 120);
  if (input.reports?.length) {
    store.reports = [...input.reports, ...store.reports].slice(0, 40);
  }
  writeCeoStore(store, input.workspaceId, root);
  return store;
}
