/**
 * Persist proactive recommendations (adapter layer).
 * Scoped by workspaceId (default keeps legacy path).
 */

import fs from "node:fs";
import path from "node:path";
import type { EmployeeRecommendation, ProactiveSignal } from "./proactive.logic";
import { opsRel } from "./workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";

export const PROACTIVE_FILE = "ai-company-proactive.json";
export const PROACTIVE_REL = opsRel(PROACTIVE_FILE, DEFAULT_WORKSPACE_ID);

type StoreShape = {
  signals: ProactiveSignal[];
  recommendations: EmployeeRecommendation[];
  lastScanAt: string | null;
};

function emptyStore(): StoreShape {
  return { signals: [], recommendations: [], lastScanAt: null };
}

function fileFor(workspaceId: string) {
  return opsRel(PROACTIVE_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  try {
    const raw = fs.readFileSync(path.join(root, fileFor(workspaceId)), "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.recommendations)) return emptyStore();
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      recommendations: parsed.recommendations,
      lastScanAt: parsed.lastScanAt ?? null,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  const filePath = path.join(root, fileFor(workspaceId));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export function listProactiveRecommendations(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): EmployeeRecommendation[] {
  return readStore(path.resolve(repoRoot), workspaceId).recommendations;
}

export function listProactiveSignals(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ProactiveSignal[] {
  return readStore(path.resolve(repoRoot), workspaceId).signals;
}

export function getProactiveRecommendation(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): EmployeeRecommendation | null {
  return listProactiveRecommendations(repoRoot, workspaceId).find((r) => r.id === id) ?? null;
}

export function saveProactiveScan(input: {
  signals: ProactiveSignal[];
  recommendations: EmployeeRecommendation[];
  scannedAt: string;
  repoRoot?: string;
  workspaceId?: string;
}): StoreShape {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const store = readStore(root, workspaceId);
  const byId = new Map(store.recommendations.map((r) => [r.id, r]));

  for (const incoming of input.recommendations) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    if (existing.status === "pending") {
      byId.set(incoming.id, {
        ...incoming,
        createdAt: existing.createdAt,
        status: existing.status,
        ceoNote: existing.ceoNote,
        reassignedToEmployeeId: existing.reassignedToEmployeeId,
        delayedUntil: existing.delayedUntil,
      });
    }
  }

  const recommendations = [...byId.values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 100);

  const next: StoreShape = {
    signals: input.signals.slice(0, 200),
    recommendations,
    lastScanAt: input.scannedAt,
  };
  writeStore(root, workspaceId, next);
  return next;
}

export function upsertProactiveRecommendation(
  rec: EmployeeRecommendation,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): EmployeeRecommendation {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.recommendations.findIndex((r) => r.id === rec.id);
  if (idx >= 0) store.recommendations[idx] = rec;
  else store.recommendations.unshift(rec);
  store.recommendations = store.recommendations.slice(0, 100);
  writeStore(root, workspaceId, store);
  return rec;
}
