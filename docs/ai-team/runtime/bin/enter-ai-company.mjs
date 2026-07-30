#!/usr/bin/env node
/**
 * Enter AI Company — CLI HQ entry point.
 * Usage: npm run ai-company:enter
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAiCompanyHqFromDisk, writeHqMarkdown } from "../lib/runtime-hq-fs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");

const result = loadAiCompanyHqFromDisk(repoRoot);
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

const { markdown, hqPath } = writeHqMarkdown(repoRoot, result.value);
process.stdout.write(markdown);
process.stderr.write(
  `\n[ai-company] HQ ${hqPath ? `stored at ${hqPath} (runtime storage)` : "generated (storage bridge unavailable)"}\n`
);
process.stderr.write(`[ai-company] Web HQ: /builder/hq\n`);
