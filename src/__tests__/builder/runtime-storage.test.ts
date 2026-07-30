/**
 * Runtime storage — Vercel-safe persistence (no project filesystem writes).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  getStorageStatus,
  getText,
  resetStorageNamespace,
  setText,
  writeJson,
  readJson,
} from "@/services/builder/storage";

describe("runtime storage", () => {
  it("stores JSON without writing to the project directory", () => {
    const root = path.join(os.tmpdir(), `ai-store-${Date.now()}`);
    resetStorageNamespace(root);
    writeJson(root, "docs/ai-team/ops/ai-company-test.json", { ok: true });
    assert.deepEqual(readJson(root, "docs/ai-team/ops/ai-company-test.json", { ok: false }), {
      ok: true,
    });
    const status = getStorageStatus();
    assert.equal(status.writable, true);
    assert.match(status.backend, /memory/);
  });

  it("isolates namespaces by repo root", () => {
    const a = path.join(os.tmpdir(), `ai-a-${Date.now()}`);
    const b = path.join(os.tmpdir(), `ai-b-${Date.now()}`);
    resetStorageNamespace(a);
    resetStorageNamespace(b);
    setText(a, "docs/ai-team/ops/HQ.md", "A");
    setText(b, "docs/ai-team/ops/HQ.md", "B");
    assert.equal(getText(a, "docs/ai-team/ops/HQ.md"), "A");
    assert.equal(getText(b, "docs/ai-team/ops/HQ.md"), "B");
  });
});
