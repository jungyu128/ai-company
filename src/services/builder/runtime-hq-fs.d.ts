/**
 * Ambient types for static imports of Builder Runtime libs from HQ adapters.
 */
declare module "../../../docs/ai-team/runtime/lib/runtime-hq-fs.mjs" {
  export function loadAiCompanyHqFromDisk(
    repoRoot?: string,
    opts?: { lastVisitAt?: string | null }
  ): { ok: boolean; value?: unknown; message?: string; code?: string };

  export function writeHqMarkdown(
    repoRoot: string,
    snapshot: unknown
  ): { markdown: string; hqPath: string };

  export function buildAiCompanyHq(input?: unknown): {
    ok: boolean;
    value?: unknown;
    message?: string;
  };

  export function formatAiCompanyHqMarkdown(hq: unknown): string;
}

declare module "../../../docs/ai-team/runtime/lib/runtime-core.mjs" {
  export function validateCeoTaskInput(input: unknown): {
    ok: boolean;
    value?: unknown;
    message?: string;
    code?: string;
    errors?: unknown[];
  };

  export function formatAuditLine(entry: {
    auditId: string;
    timestamp: string;
    actorType: string;
    actorId: string;
    taskId?: string;
    action: string;
    before: unknown;
    after: unknown;
    rationale?: string;
  }): string;
}
