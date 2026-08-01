/**
 * Append-only company knowledge store.
 * Never overwrites prior lessons/knowledge rows — only appends.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type {
  CompanyKnowledgeStoreShape,
  EvolutionSignal,
  KnowledgeLedgerEntry,
  KnowledgeRecord,
  MissionLessonRecord,
} from "./types";

export const COMPANY_KNOWLEDGE_FILE = "ai-company-company-knowledge.json";

const MAX_LEDGER = 2000;
const MAX_LESSONS = 400;
const MAX_KNOWLEDGE = 800;
const MAX_EVOLUTION = 400;

function emptyStore(): CompanyKnowledgeStoreShape {
  return { ledger: [], lessons: [], knowledge: [], evolution: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(COMPANY_KNOWLEDGE_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): CompanyKnowledgeStoreShape {
  const parsed = readJson<CompanyKnowledgeStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed) return emptyStore();
  return {
    ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
    lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
    knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
    evolution: Array.isArray(parsed.evolution) ? parsed.evolution : [],
  };
}

function writeStore(
  root: string,
  workspaceId: string,
  store: CompanyKnowledgeStoreShape
) {
  writeJson(root, fileFor(workspaceId), {
    ledger: store.ledger.slice(0, MAX_LEDGER),
    lessons: store.lessons.slice(0, MAX_LESSONS),
    knowledge: store.knowledge.slice(0, MAX_KNOWLEDGE),
    evolution: store.evolution.slice(0, MAX_EVOLUTION),
  });
}

export function getCompanyKnowledgeStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyKnowledgeStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function hasLessonForMission(
  missionKey: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): boolean {
  const store = readStore(path.resolve(repoRoot), workspaceId);
  return store.lessons.some((l) => l.missionKey === missionKey);
}

export function appendMissionLesson(input: {
  lesson: MissionLessonRecord;
  knowledge: KnowledgeRecord[];
  repoRoot?: string;
  workspaceId?: string;
}): { appended: boolean; lesson: MissionLessonRecord } {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const store = readStore(root, workspaceId);

  if (store.lessons.some((l) => l.missionKey === input.lesson.missionKey)) {
    return {
      appended: false,
      lesson: store.lessons.find((l) => l.missionKey === input.lesson.missionKey)!,
    };
  }

  const ledger: KnowledgeLedgerEntry[] = [
    {
      id: `led-${input.lesson.id}`,
      at: input.lesson.recordedAt,
      op: "record_lesson",
      entityId: input.lesson.id,
      summary: `Lesson for “${input.lesson.title}” (${input.lesson.sourceRefs.length} sources)`,
    },
    ...input.knowledge.map((k) => ({
      id: `led-${k.id}`,
      at: k.createdAt,
      op: "record_knowledge" as const,
      entityId: k.id,
      summary: `${k.category}: ${k.title}`,
    })),
  ];

  // Prepend — newest first; never mutate prior rows
  store.lessons = [input.lesson, ...store.lessons];
  store.knowledge = [...input.knowledge, ...store.knowledge];
  store.ledger = [...ledger, ...store.ledger];
  writeStore(root, workspaceId, store);
  return { appended: true, lesson: input.lesson };
}

export function appendEvolutionSignals(input: {
  signals: EvolutionSignal[];
  repoRoot?: string;
  workspaceId?: string;
}): number {
  if (input.signals.length === 0) return 0;
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const store = readStore(root, workspaceId);

  let added = 0;
  for (const signal of input.signals) {
    const existing = store.evolution.find(
      (e) => e.kind === signal.kind && e.label.toLowerCase() === signal.label.toLowerCase()
    );
    // Append-only: if same pattern exists, append a new observation row (do not overwrite)
    if (existing && existing.count === signal.count) continue;
    store.evolution = [signal, ...store.evolution];
    store.ledger = [
      {
        id: `led-${signal.id}`,
        at: signal.recordedAt,
        op: "record_evolution",
        entityId: signal.id,
        summary: `${signal.kind}: ${signal.label} ×${signal.count}`,
      },
      ...store.ledger,
    ];
    added += 1;
  }
  if (added > 0) writeStore(root, workspaceId, store);
  return added;
}

export function appendKnowledgeRecords(input: {
  knowledge: KnowledgeRecord[];
  summary?: string;
  repoRoot?: string;
  workspaceId?: string;
  at?: string;
}): number {
  if (input.knowledge.length === 0) return 0;
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const at = input.at ?? new Date().toISOString();
  const store = readStore(root, workspaceId);
  const ledger: KnowledgeLedgerEntry[] = input.knowledge.map((k) => ({
    id: `led-${k.id}`,
    at: k.createdAt || at,
    op: "record_knowledge" as const,
    entityId: k.id,
    summary: input.summary ?? `${k.category}: ${k.title}`,
  }));
  store.knowledge = [...input.knowledge, ...store.knowledge];
  store.ledger = [...ledger, ...store.ledger];
  writeStore(root, workspaceId, store);
  return input.knowledge.length;
}

export function listLessons(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): MissionLessonRecord[] {
  return readStore(path.resolve(repoRoot), workspaceId).lessons;
}

export function listKnowledge(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): KnowledgeRecord[] {
  return readStore(path.resolve(repoRoot), workspaceId).knowledge;
}

export function listEvolution(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): EvolutionSignal[] {
  return readStore(path.resolve(repoRoot), workspaceId).evolution;
}
