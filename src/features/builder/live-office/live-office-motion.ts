/**
 * UI-only helpers for living-office motion.
 * Deterministic per employee so SSR/client stay aligned — no business logic.
 */

export type MonitorKind = "code" | "chart" | "email" | "design" | "document";

export function employeeSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable CSS vars for desynced animations. */
export function employeeMotionStyle(id: string): Record<string, string> {
  const s = employeeSeed(id);
  const delay = (s % 2400) / 1000;
  const delay2 = ((s >> 3) % 1800) / 1000;
  const delay3 = ((s >> 5) % 3200) / 1000;
  const dur = 2.4 + ((s >> 2) % 160) / 100;
  const dur2 = 1.6 + ((s >> 4) % 140) / 100;
  const dur3 = 3.2 + ((s >> 6) % 180) / 100;
  return {
    "--lo-delay": `${delay}s`,
    "--lo-delay-2": `${delay2}s`,
    "--lo-delay-3": `${delay3}s`,
    "--lo-dur": `${dur}s`,
    "--lo-dur-2": `${dur2}s`,
    "--lo-dur-3": `${dur3}s`,
  };
}

export function monitorKindFor(employee: {
  id: string;
  role: string;
  currentTask: string | null;
  currentActivity: string | null;
  visualState: string;
}): MonitorKind {
  const blob = `${employee.role} ${employee.currentTask ?? ""} ${employee.currentActivity ?? ""}`.toLowerCase();
  if (
    employee.visualState === "reviewing" ||
    employee.visualState === "waiting_approval" ||
    employee.visualState === "blocked"
  ) {
    return "document";
  }
  if (employee.visualState === "planning") return "document";
  if (blob.includes("design") || blob.includes("ui") || blob.includes("front")) return "design";
  if (blob.includes("email") || blob.includes("mail") || blob.includes("sales")) return "email";
  if (
    blob.includes("analy") ||
    blob.includes("data") ||
    blob.includes("metric") ||
    blob.includes("chart")
  )
    return "chart";
  if (
    blob.includes("doc") ||
    blob.includes("brief") ||
    blob.includes("report") ||
    blob.includes("read")
  )
    return "document";
  if (
    blob.includes("code") ||
    blob.includes("deploy") ||
    blob.includes("qa") ||
    blob.includes("test") ||
    blob.includes("backend") ||
    blob.includes("devops") ||
    blob.includes("engineer")
  )
    return "code";
  const kinds: MonitorKind[] = ["code", "chart", "email", "design", "document"];
  return kinds[employeeSeed(employee.id) % kinds.length]!;
}
