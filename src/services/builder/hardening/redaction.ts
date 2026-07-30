/**
 * Safe redaction for AI Company operational surfaces.
 * Never log or return secrets, tokens, or raw credentials.
 */

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /ya29\.[A-Za-z0-9\-._~+/]+/gi,
  /refresh[_-]?token["']?\s*[:=]\s*["']?[^"'\\\s]+/gi,
  /access[_-]?token["']?\s*[:=]\s*["']?[^"'\\\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\\\s]+/gi,
  /GOOGLE_(?:CLIENT_SECRET|REFRESH_TOKEN|ACCESS_TOKEN)=[^\s&]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/gi,
];

const ENV_NAME_PATTERN = /\b(GOOGLE_[A-Z0-9_]+|AI_COMPANY_[A-Z0-9_]+|INTERNAL_[A-Z0-9_]+)\b/g;

export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(ENV_NAME_PATTERN, "[config]");
  out = out.replace(/docs\/ai-team[^\s]*/gi, "[internal]");
  out = out.replace(/Builder Runtime/gi, "AI Company");
  out = out.replace(/\bat\s+[A-Za-z0-9_./\\:-]+\.(ts|js|mjs):\d+:\d+/g, "");
  return out.trim();
}

/** Public API error body — never forwards stack traces or secret-bearing messages. */
export function publicApiError(
  code: string,
  fallbackMessage: string,
  raw?: unknown
): { code: string; error: string } {
  const rawMsg = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const redacted = redactSecrets(rawMsg);
  // Prefer stable fallback when message looks internal
  const looksInternal =
    /ENOENT|EACCES|EPERM|stack|node_modules|process\.cwd|TypeError|ReferenceError/i.test(
      redacted
    );
  return {
    code,
    error: looksInternal || !redacted ? fallbackMessage : redacted.slice(0, 280),
  };
}

export function sanitizeConnectorErrorMessage(message: string): string {
  return redactSecrets(message).slice(0, 280) || "Connection error";
}
