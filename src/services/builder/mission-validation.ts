/**
 * CEO Mission input validation (HQ adapter — not Builder Runtime redesign).
 */

export const MISSION_MIN_CHARS = 3;
export const MISSION_MAX_CHARS = 500;

export type MissionValidationOk = {
  ok: true;
  value: { mission: string; title: string };
};

export type MissionValidationErr = {
  ok: false;
  code: "EMPTY" | "TOO_LONG" | "DUPLICATE" | "INVALID";
  message: string;
};

export type MissionValidationResult = MissionValidationOk | MissionValidationErr;

export function normalizeMissionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function deriveMissionTitle(mission: string): string {
  const firstLine = mission.trim().split(/\r?\n/)[0]?.trim() ?? "";
  const compact = firstLine.replace(/\s+/g, " ");
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77).trimEnd()}…`;
}

/**
 * Validate CEO mission text before creating a Builder Runtime task.
 * @param existingTitlesOrGoals — titles and CEO goals already on the board (normalized compare)
 */
export function validateCeoMissionInput(
  raw: unknown,
  existingTitlesOrGoals: string[] = []
): MissionValidationResult {
  if (raw == null || typeof raw !== "string") {
    return { ok: false, code: "INVALID", message: "Mission must be a string" };
  }

  const mission = raw.trim();
  if (mission.length === 0) {
    return { ok: false, code: "EMPTY", message: "Mission cannot be empty" };
  }
  if (mission.length < MISSION_MIN_CHARS) {
    return {
      ok: false,
      code: "EMPTY",
      message: `Mission must be at least ${MISSION_MIN_CHARS} characters`,
    };
  }
  if (mission.length > MISSION_MAX_CHARS) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: `Mission must be at most ${MISSION_MAX_CHARS} characters`,
    };
  }

  const normalized = normalizeMissionText(mission);
  const title = deriveMissionTitle(mission);
  const titleNorm = normalizeMissionText(title);

  for (const existing of existingTitlesOrGoals) {
    const e = normalizeMissionText(existing);
    if (!e) continue;
    if (e === normalized || e === titleNorm) {
      return {
        ok: false,
        code: "DUPLICATE",
        message: "A task with the same mission or title already exists",
      };
    }
  }

  return { ok: true, value: { mission, title } };
}
