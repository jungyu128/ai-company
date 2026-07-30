import { getAuthContext, unauthorized, badRequest } from "@/lib/auth";
import {
  getRepositoryDashboard,
  createIssue,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
  readPullRequestStatus,
  mergePullRequest,
} from "@/services/github";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const dashboard = await getRepositoryDashboard();
  return Response.json({ ok: true, ...dashboard });
}

/**
 * Write actions require body.ownerApproved === true and a reason.
 * Never merges. Never writes to main.
 */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return badRequest("action is required");
  }

  const approval =
    body.ownerApproved === true
      ? {
          ownerApproved: true as const,
          reason: String(body.reason ?? "").trim(),
        }
      : null;

  try {
    switch (body.action) {
      case "create_issue": {
        const issue = await createIssue({
          title: String(body.title ?? ""),
          body: body.body ? String(body.body) : undefined,
          approval: approval!,
        });
        return Response.json({ ok: true, issue });
      }
      case "create_branch": {
        const branch = await createBranch({
          branch: String(body.branch ?? ""),
          fromRef: body.fromRef ? String(body.fromRef) : undefined,
          approval: approval!,
        });
        return Response.json({ ok: true, branch });
      }
      case "upsert_file": {
        const result = await createOrUpdateFile({
          path: String(body.path ?? ""),
          content: String(body.content ?? ""),
          message: String(body.message ?? "AI Company update"),
          branch: String(body.branch ?? ""),
          sha: body.sha ? String(body.sha) : undefined,
          approval: approval!,
        });
        return Response.json({ ok: true, result });
      }
      case "create_pr": {
        const pr = await createPullRequest({
          title: String(body.title ?? ""),
          body: body.body ? String(body.body) : undefined,
          head: String(body.head ?? ""),
          base: body.base ? String(body.base) : undefined,
          draft: body.draft !== false,
          approval: approval!,
        });
        return Response.json({ ok: true, pullRequest: pr });
      }
      case "pr_status": {
        const pr = await readPullRequestStatus(Number(body.number));
        return Response.json({ ok: true, pullRequest: pr });
      }
      case "merge_pr": {
        await mergePullRequest();
        return Response.json({ ok: false }, { status: 400 });
      }
      default:
        return badRequest(`Unknown action: ${body.action}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "GitHub action failed";
    const status = message.includes("approval") ? 403 : 400;
    return Response.json({ ok: false, error: message }, { status });
  }
}
