/**
 * HQ timestamp display strings — deterministic across Node SSR and browser.
 * Manual KST formatting (no Intl) so ICU cannot emit "PM" vs "오후".
 * Safe to import from client components when formatting existing ISO fields.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function partsInKst(ms: number): {
  year: number;
  month: string;
  day: string;
  period: "오전" | "오후";
  hour12: string;
  minute: string;
  second: string;
} {
  const kst = new Date(ms + KST_OFFSET_MS);
  const hour24 = kst.getUTCHours();
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    year: kst.getUTCFullYear(),
    month: pad2(kst.getUTCMonth() + 1),
    day: pad2(kst.getUTCDate()),
    period,
    hour12: pad2(hour12),
    minute: pad2(kst.getUTCMinutes()),
    second: pad2(kst.getUTCSeconds()),
  };
}

/** Format an ISO timestamp as `YYYY. MM. DD. 오전|오후 HH:MM:SS` in Asia/Seoul. */
export function formatHqDateTimeDisplay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;

  const p = partsInKst(ms);
  return `${p.year}. ${p.month}. ${p.day}. ${p.period} ${p.hour12}:${p.minute}:${p.second}`;
}

/**
 * Fixed ko-KR style clock for Live Office (and other dual SSR/client surfaces).
 * Manual KST — never use `toLocaleTimeString()` without an explicit locale.
 */
export function formatHqTimeDisplay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;

  const p = partsInKst(ms);
  return `${p.period} ${p.hour12}:${p.minute}`;
}
