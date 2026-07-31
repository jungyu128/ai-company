/**
 * AI Company Meeting System — create, discuss, CEO decide, audit.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";
import {
  buildMeetingDraft,
  runMeetingDiscussion,
  detectNeededMeetings,
  createCompanyMeeting,
  applyCeoMeetingAction,
  autoCreateNeededMeetings,
  listCompanyMeetings,
  resolveMeetingLifecycles,
  isMeetingOccupyingEmployees,
  resumeWorkStateAfterMeeting,
  MEETING_KIND_LABEL,
} from "@/services/builder/meetings";
import { upsertMeeting } from "@/services/builder/meetings/meeting.store";
import { upsertEmployeeStates } from "@/services/builder/continuous-os/continuous-os.store";
import { syncLiveWorkTracker } from "@/services/builder/live-work-tracker/server";
import { getCompanyTimeline } from "@/services/builder/company-timeline";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";
import { listAudit, listActivity } from "@/services/builder/workspace/collaboration-feed";

describe("meeting structure and discussion", () => {
  it("builds meetings with required fields and employee discussion before CEO", () => {
    const now = "2026-07-31T16:00:00.000Z";
    const draft = buildMeetingDraft({
      kind: "architecture_review",
      now,
      workItemTitle: "HQ Conversation autonomy",
      missionId: "TASK-MTG-001",
    });
    assert.equal(draft.title.includes("Architecture Review"), true);
    assert.ok(draft.purpose.length > 10);
    assert.ok(draft.participantIds.length >= 2);
    assert.ok(draft.agenda.length >= 2);
    assert.equal(draft.discussion.length, 0);
    assert.equal(MEETING_KIND_LABEL.daily_standup, "Daily Standup");

    const discussed = runMeetingDiscussion({ meeting: draft, now });
    assert.ok(discussed.discussion.length >= 2);
    assert.ok(discussed.decisions.length >= 1);
    assert.ok(discussed.actionItems.length >= 1);
    assert.ok(discussed.actionItems.every((a) => a.ownerEmployeeId && a.dueDate));
    assert.ok(discussed.owners.length >= 1);
    assert.ok(discussed.dueDates.length >= 1);
    assert.match(discussed.synthesis, /Ready for CEO/i);
  });

  it("detects needed meeting kinds from WorkPilot signals", () => {
    const hints = detectNeededMeetings({
      now: "2026-07-31T16:00:00.000Z",
      missionTitles: ["HQ Conversation autonomy"],
      taskTitles: ["Advance architecture for HQ chat", "QA regression pack"],
      taskStatuses: ["in_progress", "peer_review"],
      existingOpenKinds: new Set(),
    });
    const kinds = new Set(hints.map((h) => h.kind));
    assert.ok(kinds.has("sprint_planning") || kinds.has("architecture_review"));
    assert.ok(hints.length <= 2);
  });
});

describe("meeting service + CEO actions + audit", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates a meeting with discussion, decisions, actions, owners, and due dates", () => {
    const result = createCompanyMeeting({
      kind: "qa_review",
      workItemTitle: "HQ Conversation autonomy",
      missionId: "TASK-MTG-QA",
      repoRoot: tmp,
      now: "2026-07-31T16:10:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const m = result.meeting;
    assert.equal(m.status, "awaiting_ceo");
    assert.ok(m.discussion.length >= 2);
    assert.ok(m.decisions.length >= 1);
    assert.ok(m.actionItems.length >= 1);
    assert.ok(m.owners.length >= 1);
    assert.ok(m.dueDates.length >= 1);
    assert.ok(m.synthesis);

    const audits = listAudit("default", tmp);
    assert.ok(audits.some((a) => a.action === "meeting.create"));
    assert.ok(audits.some((a) => a.action === "meeting.present"));
    const activity = listActivity("default", tmp);
    assert.ok(activity.some((a) => a.relatedType === "meeting"));
  });

  it("lets the CEO join, comment, approve, postpone, and reject", () => {
    const created = createCompanyMeeting({
      kind: "release_review",
      workItemTitle: "WorkPilot beta slice",
      repoRoot: tmp,
      now: "2026-07-31T16:20:00.000Z",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const id = created.meeting.id;

    const joined = applyCeoMeetingAction({
      meetingId: id,
      action: "join",
      note: "Listening in",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    assert.equal(joined.meeting.ceoJoined, true);

    const commented = applyCeoMeetingAction({
      meetingId: id,
      action: "comment",
      note: "Need CI evidence",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(commented.ok, true);
    if (!commented.ok) return;
    assert.ok(commented.meeting.ceoComments.some((c) => /CI evidence/.test(c.body)));

    const approved = applyCeoMeetingAction({
      meetingId: id,
      action: "approve",
      note: "Approved with evidence",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.meeting.status, "approved");
    assert.ok(approved.meeting.decisions.every((d) => d.status === "approved"));

    const other = createCompanyMeeting({
      kind: "incident_review",
      workItemTitle: "Hotfix path",
      repoRoot: tmp,
      now: "2026-07-31T16:25:00.000Z",
    });
    assert.equal(other.ok, true);
    if (!other.ok) return;

    const postponed = applyCeoMeetingAction({
      meetingId: other.meeting.id,
      action: "postpone",
      note: "Tomorrow",
      postponeUntil: "2026-08-01",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(postponed.ok, true);
    if (!postponed.ok) return;
    assert.equal(postponed.meeting.status, "postponed");

    const third = createCompanyMeeting({
      kind: "design_review",
      workItemTitle: "HQ shell",
      repoRoot: tmp,
      now: "2026-07-31T16:30:00.000Z",
    });
    assert.equal(third.ok, true);
    if (!third.ok) return;
    const rejected = applyCeoMeetingAction({
      meetingId: third.meeting.id,
      action: "reject",
      note: "Scope wrong",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.meeting.status, "rejected");
    assert.ok(
      listAudit("default", tmp).some((a) => a.action === "meeting.ceo_reject")
    );
  });

  it("auto-creates meetings from active WorkPilot missions/tasks", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-MTG-AUTO",
      title: "HQ Conversation autonomy",
      mission: "Ship WorkPilot HQ conversation architecture and QA coverage",
      leadEmployeeId: "david",
      planSummary: "HQ meetings",
      planSteps: ["Architecture", "QA"],
      now: "2026-07-31T16:40:00.000Z",
    });
    upsertCollaboration(mission, tmp, "default");
    const task = proposeDevTask({
      title: "Advance architecture for HQ chat",
      description: "Architecture plan with acceptance criteria for desktop HQ.",
      ownerEmployeeId: "david",
      now: "2026-07-31T16:40:00.000Z",
      status: "in_progress",
    });
    upsertDevTasks([task], tmp, "default");

    const created = autoCreateNeededMeetings({
      repoRoot: tmp,
      now: "2026-07-31T16:40:00.000Z",
    });
    assert.ok(created.length >= 1);
    assert.ok(created.every((m) => m.discussion.length >= 1));
    assert.ok(created.every((m) => m.status === "awaiting_ceo"));
    assert.ok(created.every((m) => m.completedAt != null));
    assert.ok(created.every((m) => !isMeetingOccupyingEmployees(m)));
    assert.ok(listCompanyMeetings({ repoRoot: tmp }).length >= created.length);
  });
});

describe("meeting lifecycle — no permanent Waiting deadlock", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-life-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("runs Scheduled → Started → In Progress → Completed lifecycle with timeline events", () => {
    const result = createCompanyMeeting({
      kind: "daily_standup",
      workItemTitle: "WorkPilot HQ",
      presentToCeo: false,
      repoRoot: tmp,
      now: "2026-07-31T17:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.meeting.status, "completed");
    assert.ok(result.meeting.startedAt);
    assert.ok(result.meeting.completedAt);
    assert.equal(result.meeting.agendaCompleted, true);
    assert.equal(isMeetingOccupyingEmployees(result.meeting), false);

    const timeline = getCompanyTimeline({ repoRoot: tmp });
    assert.ok(timeline.events.some((e) => e.kind === "meeting_started"));
    assert.ok(timeline.events.some((e) => e.kind === "meeting_completed"));
    assert.ok(timeline.events.some((e) => e.kind === "resumed"));
  });

  it("auto-finishes Daily Standup after agenda completion and resumes Working", () => {
    const task = proposeDevTask({
      title: "Ship standup follow-up",
      description: "Continue WorkPilot implementation with acceptance criteria.",
      ownerEmployeeId: "alex",
      now: "2026-07-31T17:05:00.000Z",
      status: "in_progress",
    });
    upsertDevTasks([task], tmp, "default");
    upsertEmployeeStates(
      [
        {
          employeeId: "alex",
          employeeName: "Alex",
          state: "Working",
          activeTaskId: task.id,
          note: task.title,
          priority: 1,
          interrupted: false,
          updatedAt: "2026-07-31T17:05:00.000Z",
        },
      ],
      tmp,
      "default"
    );

    const result = createCompanyMeeting({
      kind: "daily_standup",
      workItemTitle: task.title,
      presentToCeo: false,
      repoRoot: tmp,
      now: "2026-07-31T17:06:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.meeting.status, "completed");
    assert.ok(result.meeting.agenda.every((a) => a.completed));

    const snap = syncLiveWorkTracker({
      repoRoot: tmp,
      now: "2026-07-31T17:06:30.000Z",
    });
    const alex = snap.employees.find((e) => e.employeeId === "alex");
    assert.ok(alex);
    assert.equal(alex!.status, "Working");
    assert.notEqual(alex!.currentStep, "In meeting");
  });

  it("Architecture Review finishes after decision and resumes Reviewing", () => {
    const task = proposeDevTask({
      title: "Architecture boundary review pack",
      description: "Peer review architecture plan for HQ chat.",
      ownerEmployeeId: "olivia",
      now: "2026-07-31T17:10:00.000Z",
      status: "peer_review",
    });
    upsertDevTasks([task], tmp, "default");
    upsertEmployeeStates(
      [
        {
          employeeId: "olivia",
          employeeName: "Olivia",
          state: "Reviewing",
          activeTaskId: task.id,
          note: task.title,
          priority: 1,
          interrupted: false,
          updatedAt: "2026-07-31T17:10:00.000Z",
        },
      ],
      tmp,
      "default"
    );

    const result = createCompanyMeeting({
      kind: "architecture_review",
      workItemTitle: task.title,
      presentToCeo: true,
      repoRoot: tmp,
      now: "2026-07-31T17:11:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.meeting.status, "awaiting_ceo");
    assert.ok(result.meeting.completedAt);
    assert.ok(result.meeting.decisions.length >= 1);
    assert.equal(isMeetingOccupyingEmployees(result.meeting), false);

    const snap = syncLiveWorkTracker({
      repoRoot: tmp,
      now: "2026-07-31T17:11:30.000Z",
    });
    const olivia = snap.employees.find((e) => e.employeeId === "olivia");
    assert.ok(olivia);
    assert.equal(olivia!.status, "Reviewing");
  });

  it("Release Review finishes after decision and resumes Completed", () => {
    const task = proposeDevTask({
      title: "Release review for beta slice",
      description: "Finalize release checklist — no auto-deploy.",
      ownerEmployeeId: "daniel",
      now: "2026-07-31T17:15:00.000Z",
      status: "done",
    });
    upsertDevTasks([task], tmp, "default");
    upsertEmployeeStates(
      [
        {
          employeeId: "daniel",
          employeeName: "Daniel",
          state: "Completed",
          activeTaskId: task.id,
          note: task.title,
          priority: 1,
          interrupted: false,
          updatedAt: "2026-07-31T17:15:00.000Z",
        },
      ],
      tmp,
      "default"
    );

    const result = createCompanyMeeting({
      kind: "release_review",
      workItemTitle: task.title,
      presentToCeo: true,
      repoRoot: tmp,
      now: "2026-07-31T17:16:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.meeting.completedAt);
    assert.equal(isMeetingOccupyingEmployees(result.meeting), false);

    const snap = syncLiveWorkTracker({
      repoRoot: tmp,
      now: "2026-07-31T17:16:30.000Z",
    });
    const daniel = snap.employees.find((e) => e.employeeId === "daniel");
    assert.ok(daniel);
    assert.equal(daniel!.status, "Completed");
  });

  it("recovers stale meetings and frees multiple participants", () => {
    const draft = buildMeetingDraft({
      kind: "daily_standup",
      now: "2026-07-31T12:00:00.000Z",
      workItemTitle: "Stale standup",
    });
    const stuck = {
      ...draft,
      status: "in_progress" as const,
      startedAt: "2026-07-31T12:00:00.000Z",
      lastActivityAt: "2026-07-31T12:00:00.000Z",
      expectedDurationMinutes: 15,
      discussion: [
        {
          id: "md-1",
          employeeId: "sarah",
          employeeName: "Sarah",
          role: "PM",
          body: "Opening",
          at: "2026-07-31T12:00:00.000Z",
        },
      ],
    };
    upsertMeeting(stuck, tmp, "default");

    for (const id of stuck.participantIds.slice(0, 3)) {
      const emp = AI_COMPANY_EMPLOYEES.find((e) => e.id === id)!;
      upsertEmployeeStates(
        [
          {
            employeeId: emp.id,
            employeeName: emp.name,
            state: "Meeting",
            activeTaskId: null,
            note: `In meeting: ${stuck.title}`,
            priority: 1,
            interrupted: false,
            updatedAt: "2026-07-31T12:00:00.000Z",
            waitingFor: stuck.title,
            currentStep: "In meeting",
          },
        ],
        tmp,
        "default"
      );
    }

    const resolved = resolveMeetingLifecycles({
      repoRoot: tmp,
      now: "2026-07-31T13:00:00.000Z",
    });
    assert.ok(resolved.length >= 1);
    assert.ok(resolved[0]!.stale || resolved[0]!.completedAt);
    assert.equal(isMeetingOccupyingEmployees(resolved[0]!), false);

    const snap = syncLiveWorkTracker({
      repoRoot: tmp,
      now: "2026-07-31T13:00:30.000Z",
    });
    for (const id of stuck.participantIds.slice(0, 3)) {
      const row = snap.employees.find((e) => e.employeeId === id);
      assert.ok(row);
      assert.notEqual(row!.status, "Meeting");
      assert.notEqual(row!.currentStep, "In meeting");
    }
  });

  it("does not treat awaiting_ceo as permanent occupancy (legacy deadlock fix)", () => {
    assert.equal(
      isMeetingOccupyingEmployees({
        ...buildMeetingDraft({
          kind: "architecture_review",
          now: "2026-07-31T18:00:00.000Z",
        }),
        status: "awaiting_ceo",
        completedAt: "2026-07-31T18:00:00.000Z",
        startedAt: "2026-07-31T18:00:00.000Z",
      }),
      false
    );
    assert.equal(resumeWorkStateAfterMeeting({ taskStatus: "in_progress" }), "Working");
    assert.equal(resumeWorkStateAfterMeeting({ taskStatus: "peer_review" }), "Reviewing");
    assert.equal(resumeWorkStateAfterMeeting({ taskStatus: "done" }), "Completed");
  });
});
