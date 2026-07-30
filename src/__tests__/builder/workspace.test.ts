import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration, listCollaborations } from "@/services/builder/collaboration.store";
import { decideApproval, listApprovalCenter } from "@/services/builder/approval.service";
import { upsertMemory, listMemories } from "@/services/builder/memory/memory.store";
import { opsRel } from "@/services/builder/workspace/paths";
import {
  roleHasPermission,
  permissionsForRole,
} from "@/services/builder/workspace/permissions";
import {
  createWorkspace,
  ensureDefaultWorkspace,
  addOrUpdateMember,
  getMember,
  listMembers,
} from "@/services/builder/workspace/workspace.store";
import {
  addMissionComment,
  listActivity,
  listAudit,
  listNotifications,
  markNotificationRead,
  recordWorkspaceEvent,
} from "@/services/builder/workspace/collaboration-feed";
import { ensureHqAccess } from "@/services/builder/workspace/workspace.service";
import type { AuthContext } from "@/lib/auth";
import type { CompanyMemory } from "@/services/builder/memory/types";

function auth(userId: string, email = `${userId}@example.com`): AuthContext {
  return {
    user: {
      id: userId,
      email,
      name: userId,
    } as AuthContext["user"],
    companyId: "company-test",
    role: "OWNER",
  };
}

function mission(id: string, title: string, workspaceLead = "emma") {
  return planCollaborationChain({
    missionId: id,
    title,
    mission: title,
    leadEmployeeId: workspaceLead,
    planSummary: title,
    planSteps: ["Plan", "Execute"],
    now: "2026-07-29T10:00:00.000Z",
  });
}

describe("AI Company workspace collaboration v8", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-ws-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("isolates collaborations and memory between workspaces", () => {
    const a = mission("TASK-A-1", "Workspace A mission");
    const b = mission("TASK-B-1", "Workspace B mission");
    upsertCollaboration(a, tmp, "default");
    upsertCollaboration(b, tmp, "ws-other");

    assert.equal(listCollaborations(tmp, "default").length, 1);
    assert.equal(listCollaborations(tmp, "ws-other").length, 1);
    assert.equal(listCollaborations(tmp, "default")[0].id, "TASK-A-1");
    assert.equal(listCollaborations(tmp, "ws-other")[0].id, "TASK-B-1");

    const memA: CompanyMemory = {
      id: "mem-a",
      patternKey: "pref-a",
      kind: "preferred_assignment",
      title: "Prefer short emails in A",
      insight: "Prefer short emails in A",
      evidenceCount: 1,
      sourceRefs: ["ok"],
      confidence: 70,
      ceoStatus: "pending",
      expiration: { softExpireDays: 30, hardExpireDays: 90 },
      createdAt: "2026-07-29T10:00:00.000Z",
      lastUpdated: "2026-07-29T10:00:00.000Z",
      acceptedAt: null,
      ignoredAt: null,
    };
    upsertMemory(memA, tmp, "default");
    upsertMemory(
      { ...memA, id: "mem-b", patternKey: "pref-b", title: "B only", insight: "B only" },
      tmp,
      "ws-other"
    );

    assert.equal(listMemories(tmp, "default").length, 1);
    assert.equal(listMemories(tmp, "ws-other").length, 1);
    assert.match(listMemories(tmp, "default")[0].insight, /A/);
    assert.match(listMemories(tmp, "ws-other")[0].insight, /B/);

    assert.equal(opsRel("ai-company-collaborations.json", "default"), "docs/ai-team/ops/ai-company-collaborations.json");
    assert.equal(
      opsRel("ai-company-collaborations.json", "ws-other"),
      "docs/ai-team/ops/workspaces/ws-other/ai-company-collaborations.json"
    );
  });

  it("enforces role permissions", () => {
    assert.equal(roleHasPermission("owner", "approvals.decide"), true);
    assert.equal(roleHasPermission("viewer", "approvals.decide"), false);
    assert.equal(roleHasPermission("member", "memory.manage"), false);
    assert.equal(roleHasPermission("manager", "memory.manage"), true);
    assert.equal(roleHasPermission("admin", "settings.manage"), true);
    assert.equal(roleHasPermission("owner", "settings.manage"), true);
    assert.ok(permissionsForRole("viewer").includes("timeline.view"));
    assert.ok(!permissionsForRole("viewer").includes("mission.assign"));
  });

  it("supports workspace switching via membership + access checks", () => {
    ensureDefaultWorkspace({
      userId: "ceo-1",
      email: "ceo@example.com",
      displayName: "CEO One",
      repoRoot: tmp,
    });
    const other = createWorkspace({
      name: "Secondary AI Company",
      ownerUserId: "ceo-1",
      ownerEmail: "ceo@example.com",
      ownerDisplayName: "CEO One",
      repoRoot: tmp,
    });
    addOrUpdateMember({
      workspaceId: other.id,
      userId: "viewer-1",
      email: "viewer@example.com",
      displayName: "Viewer",
      role: "viewer",
      repoRoot: tmp,
    });

    const ceoDefault = ensureHqAccess({
      auth: auth("ceo-1", "ceo@example.com"),
      workspaceId: "default",
      repoRoot: tmp,
    });
    assert.equal(ceoDefault.ok, true);
    if (ceoDefault.ok) assert.equal(ceoDefault.ctx.role, "owner");

    const ceoOther = ensureHqAccess({
      auth: auth("ceo-1", "ceo@example.com"),
      workspaceId: other.id,
      permission: "approvals.decide",
      repoRoot: tmp,
    });
    assert.equal(ceoOther.ok, true);

    const stranger = ensureHqAccess({
      auth: auth("outsider"),
      workspaceId: other.id,
      repoRoot: tmp,
    });
    assert.equal(stranger.ok, false);
    if (!stranger.ok) assert.equal(stranger.code, "FORBIDDEN");

    const viewerApprove = ensureHqAccess({
      auth: auth("viewer-1", "viewer@example.com"),
      workspaceId: other.id,
      permission: "approvals.decide",
      repoRoot: tmp,
    });
    assert.equal(viewerApprove.ok, false);
    if (!viewerApprove.ok) assert.equal(viewerApprove.code, "FORBIDDEN");
  });

  it("records activity timeline, notifications, and audit trail", () => {
    recordWorkspaceEvent({
      workspaceId: "default",
      kind: "mission",
      summary: "Mission assigned",
      actorUserId: "ceo-1",
      actorName: "CEO",
      actorRole: "owner",
      relatedType: "mission",
      relatedId: "TASK-1",
      status: "pending",
      auditAction: "mission.assign",
      notify: {
        kind: "pending_approval",
        title: "Approval needed",
        body: "Review mission",
        userId: "ceo-1",
      },
      repoRoot: tmp,
    });

    const activity = listActivity("default", tmp);
    assert.equal(activity.length, 1);
    assert.equal(activity[0].actorName, "CEO");
    assert.equal(activity[0].relatedId, "TASK-1");
    assert.equal(activity[0].status, "pending");

    const notes = listNotifications("default", { userId: "ceo-1", repoRoot: tmp });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].read, false);
    const marked = markNotificationRead("default", notes[0].id, tmp);
    assert.equal(marked?.read, true);

    const audit = listAudit("default", tmp);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "mission.assign");
    assert.equal(audit[0].result, "ok");
    assert.equal(audit[0].workspaceId, "default");
  });

  it("supports collaboration comments on missions", () => {
    const comment = addMissionComment(
      {
        workspaceId: "default",
        missionId: "TASK-1",
        authorUserId: "mgr-1",
        authorName: "Manager",
        body: "Please prioritize this",
      },
      tmp
    );
    recordWorkspaceEvent({
      workspaceId: "default",
      kind: "comment",
      summary: "Manager commented",
      actorUserId: "mgr-1",
      actorName: "Manager",
      actorRole: "manager",
      relatedType: "mission",
      relatedId: "TASK-1",
      status: "commented",
      auditAction: "comment.create",
      notify: {
        kind: "collaboration_request",
        title: "New comment",
        body: comment.body,
      },
      repoRoot: tmp,
    });

    assert.equal(listActivity("default", tmp)[0].kind, "comment");
    assert.ok(listNotifications("default", { repoRoot: tmp }).length >= 1);
  });

  it("tracks multi-user approvals with actor audit", async () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "owner@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    addOrUpdateMember({
      workspaceId: "default",
      userId: "mgr-1",
      email: "mgr@example.com",
      displayName: "Manager Pat",
      role: "manager",
      repoRoot: tmp,
    });

    const collab = mission("TASK-APPROVE-1", "Needs multi-user approval");
    upsertCollaboration(collab, tmp, "default");
    assert.equal(listApprovalCenter(tmp, "default").length, 1);

    const result = await decideApproval({
      missionId: "TASK-APPROVE-1",
      decision: "approve",
      note: "Looks good",
      repoRoot: tmp,
      workspaceId: "default",
      actor: {
        userId: "mgr-1",
        displayName: "Manager Pat",
        role: "manager",
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.item.approvalStatus, "approved");
    }

    const activity = listActivity("default", tmp);
    assert.ok(activity.some((a) => a.kind === "approval" && a.actorUserId === "mgr-1"));
    const audit = listAudit("default", tmp);
    assert.ok(audit.some((e) => e.action === "approval.approve" && e.actorName === "Manager Pat"));

    // Isolation: other workspace still empty
    assert.equal(listApprovalCenter(tmp, "ws-other").length, 0);
    assert.equal(listActivity("ws-other", tmp).length, 0);
  });

  it("does not leak membership across workspaces", () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "owner@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    const ws2 = createWorkspace({
      name: "Private",
      ownerUserId: "owner-2",
      ownerEmail: "o2@example.com",
      ownerDisplayName: "Owner Two",
      repoRoot: tmp,
    });
    assert.equal(getMember("default", "owner-2", tmp), null);
    assert.ok(getMember(ws2.id, "owner-2", tmp));
    assert.equal(listMembers("default", tmp).every((m) => m.workspaceId === "default"), true);
  });
});
