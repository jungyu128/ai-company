/**
 * Memory safety — strip secrets and refuse unsafe content.
 */

const SECRET_PATTERNS: RegExp[] = [
  /GOOGLE_CLIENT_SECRET/i,
  /CRM_API_KEY/i,
  /refresh_token\s*=/i,
  /access_token/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /sk-[A-Za-z0-9]{10,}/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /client_secret\s*[:=]/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];

const RAW_EMAIL_BODY = /(?:^|\n)(?:From|To|Subject):\s.+\n(?:.|\n){200,}/i;

export function containsSecretMaterial(text: string): boolean {
  if (!text) return false;
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Sanitize operational text for memory storage — never keep tokens/secrets. */
export function sanitizeMemoryText(input: string, maxLen = 240): string {
  let text = input.replace(/\s+/g, " ").trim();
  for (const re of SECRET_PATTERNS) {
    text = text.replace(re, "[redacted]");
  }
  // Drop long raw message dumps
  if (RAW_EMAIL_BODY.test(text)) {
    text = text.slice(0, 120) + "…";
  }
  if (text.length > maxLen) text = text.slice(0, maxLen - 1) + "…";
  return text;
}

export function isSafeMemoryPayload(parts: string[]): boolean {
  return parts.every((p) => !containsSecretMaterial(p));
}
