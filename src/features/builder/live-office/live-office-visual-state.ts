/**
 * Live Office visual-state mapping — driven only by persisted Live Work Tracker
 * and real collaboration / approval relationships. Never invents work.
 */

export type LiveOfficeVisualState =
  | "idle"
  | "planning"
  | "working"
  | "reviewing"
  | "discussion"
  | "waiting"
  | "waiting_approval"
  | "blocked"
  | "completed";

export type LiveOfficeVisualMeta = {
  label: string;
  /** Short verb for desk tag / bubble. */
  verb: string;
};

export const LIVE_OFFICE_VISUAL_META: Record<
  LiveOfficeVisualState,
  LiveOfficeVisualMeta
> = {
  idle: { label: "Idle", verb: "Idle" },
  planning: { label: "Planning", verb: "Thinking" },
  working: { label: "Working", verb: "Working" },
  reviewing: { label: "Reviewing", verb: "Reviewing" },
  discussion: { label: "In Discussion", verb: "Discussing" },
  waiting: { label: "Waiting", verb: "Waiting" },
  waiting_approval: { label: "Waiting Approval", verb: "Waiting for CEO approval" },
  blocked: { label: "Blocked", verb: "Blocked" },
  completed: { label: "Completed", verb: "Completed" },
};

export type LiveWorkStatusInput =
  | "Idle"
  | "Planning"
  | "Working"
  | "Reviewing"
  | "Meeting"
  | "Waiting"
  | "Blocked"
  | "Completed"
  | string;

/**
 * Map Live Work Tracker status → office visual state.
 * Approval-waiting and discussion require real relationships (passed as flags).
 */
export function mapLiveWorkToVisualState(input: {
  liveWorkStatus: LiveWorkStatusInput;
  /** Real pending CEO/mission approval for this employee. */
  hasPendingApproval: boolean;
  /** Real collaboration, recommendation peer, or open meeting participant. */
  hasDiscussionPartner: boolean;
}): LiveOfficeVisualState {
  const status = input.liveWorkStatus;

  switch (status) {
    case "Idle":
      return "idle";
    case "Planning":
      return "planning";
    case "Working":
      return "working";
    case "Reviewing":
      return "reviewing";
    case "Meeting":
      // Meeting occupancy is real Continuous OS state; treat as discussion only
      // when a partner relationship exists, otherwise stay waiting near desk.
      return input.hasDiscussionPartner ? "discussion" : "waiting";
    case "Waiting":
      return input.hasPendingApproval ? "waiting_approval" : "waiting";
    case "Blocked":
      return "blocked";
    case "Completed":
      return "completed";
    default:
      return "idle";
  }
}

/** Legacy card-status mapper kept for compatibility; prefer mapLiveWorkToVisualState. */
export function mapCardStatusToVisualState(
  status:
    | "online"
    | "offline"
    | "thinking"
    | "working"
    | "collaborating"
    | "waiting_approval"
    | "completed"
    | string
): LiveOfficeVisualState {
  switch (status) {
    case "thinking":
      return "planning";
    case "working":
      return "working";
    case "collaborating":
      return "discussion";
    case "waiting_approval":
      return "waiting_approval";
    case "completed":
      return "completed";
    case "online":
    case "offline":
    default:
      return "idle";
  }
}

export function shouldMoveToApprovalZone(
  visualState: LiveOfficeVisualState,
  hasPendingApproval: boolean
): boolean {
  return visualState === "waiting_approval" && hasPendingApproval;
}

export function shouldMoveTowardPartner(
  visualState: LiveOfficeVisualState,
  hasDiscussionPartner: boolean
): boolean {
  return visualState === "discussion" && hasDiscussionPartner;
}

/** Clamp office coordinates so employees stay on the floor plate. */
export function clampOfficePosition(
  x: number,
  y: number,
  bounds = { minX: 12, maxX: 90, minY: 28, maxY: 82 }
): { x: number; y: number } {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, y)),
  };
}

/**
 * Midpoint toward a partner desk, kept subtle (biased to home desk).
 */
export function discussionPosition(input: {
  home: { x: number; y: number };
  partner: { x: number; y: number };
  /** 0 = stay home, 1 = full midpoint */
  pull?: number;
}): { x: number; y: number } {
  const pull = input.pull ?? 0.38;
  const x = input.home.x + (input.partner.x - input.home.x) * pull;
  const y = input.home.y + (input.partner.y - input.home.y) * pull;
  return clampOfficePosition(x, y);
}

export function approvalZonePosition(input: {
  zone: { x: number; y: number };
  employeeId: string;
  slot?: number;
}): { x: number; y: number } {
  const slot =
    input.slot ??
    Math.abs(input.employeeId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) %
      5;
  return clampOfficePosition(
    input.zone.x - 16 + slot * 8,
    input.zone.y
  );
}

/** Nudge colliding positions apart without leaving bounds. */
export function separateOverlappingPositions(
  positions: Array<{ id: string; x: number; y: number }>,
  minDist = 6
): Array<{ id: string; x: number; y: number }> {
  const next = positions.map((p) => ({ ...p }));
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i]!;
      const b = next[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      if (dist >= minDist) continue;
      const push = (minDist - dist) / 2;
      const ux = dx / dist;
      const uy = dy / dist;
      const aN = clampOfficePosition(a.x - ux * push, a.y - uy * push);
      const bN = clampOfficePosition(b.x + ux * push, b.y + uy * push);
      a.x = aN.x;
      a.y = aN.y;
      b.x = bN.x;
      b.y = bN.y;
    }
  }
  return next;
}

export function bubbleTextFor(input: {
  visualState: LiveOfficeVisualState;
  currentTask: string | null;
  currentStep: string | null;
  waitingFor: string | null;
  blockedReason?: string | null;
  discussingWith?: string | null;
  progressPercent?: number | null;
}): { status: string; detail: string; extra: string | null } {
  const meta = LIVE_OFFICE_VISUAL_META[input.visualState];
  const task = (input.currentTask ?? "").trim();
  const step = (input.currentStep ?? "").trim();

  let detail = "";
  let extra: string | null = null;

  switch (input.visualState) {
    case "idle":
      detail = "At desk";
      break;
    case "planning":
      detail = truncate(step || task || "Planning next step", 42);
      break;
    case "working":
      detail = truncate(task || step || "Executing work", 42);
      if (
        typeof input.progressPercent === "number" &&
        input.progressPercent > 0 &&
        input.progressPercent < 100
      ) {
        extra = `${input.progressPercent}%`;
      }
      break;
    case "reviewing":
      detail = truncate(task || step || "Review in progress", 42);
      break;
    case "discussion":
      detail = truncate(
        input.discussingWith
          ? `With ${input.discussingWith}`
          : task || step || "In discussion",
        42
      );
      break;
    case "waiting":
      detail = truncate(
        input.waitingFor ? `Waiting: ${input.waitingFor}` : step || "Waiting",
        42
      );
      extra = input.waitingFor ? truncate(input.waitingFor, 28) : null;
      break;
    case "waiting_approval":
      detail = "Waiting for CEO approval";
      extra = input.waitingFor ? truncate(input.waitingFor, 28) : null;
      break;
    case "blocked":
      detail = truncate(
        input.blockedReason ||
          input.waitingFor ||
          step ||
          "Work blocked",
        42
      );
      extra = "Blocked";
      break;
    case "completed":
      detail = truncate(task || "Work completed", 42);
      break;
  }

  return { status: meta.verb, detail, extra };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Disable walk/bob motion when the user prefers reduced motion. */
export function shouldAnimateEmployeeMovement(
  prefersReducedMotion: boolean
): boolean {
  return !prefersReducedMotion;
}

/**
 * Layout mode for Live Office at common HQ widths.
 * Used by tests to assert responsive breakpoints stay non-overlapping.
 */
export function officeLayoutModeForWidth(
  widthPx: number
): "compact" | "standard" | "wide" | "ultrawide" {
  if (widthPx <= 1100) return "compact";
  if (widthPx < 1440) return "standard";
  if (widthPx < 1920) return "wide";
  return "ultrawide";
}

/** Desk tag width budget (rem) so labels do not clip at common widths. */
export function deskTagWidthRemForLayout(
  mode: ReturnType<typeof officeLayoutModeForWidth>
): number {
  switch (mode) {
    case "compact":
      return 6.4;
    case "standard":
      return 7.1;
    case "wide":
      return 7.1;
    case "ultrawide":
      return 7.4;
  }
}
