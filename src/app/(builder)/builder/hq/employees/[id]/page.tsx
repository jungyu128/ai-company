import { notFound } from "next/navigation";
import Link from "next/link";
import { isInternalAiCompanyEnabled } from "@/services/builder/internal-ai-company";
import { getAiCompanyEmployeeProfile } from "@/services/builder/company.service";
import { AiCompanyEmployeeProfileView } from "@/features/builder/components/ai-company-employee-profile";
import { HqShellPage } from "@/features/builder/components/hq-shell-page";
import { DEFAULT_WORKSPACE_ID } from "@/services/builder/workspace/workspace.service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ workspaceId?: string }>;
};

export default async function AiCompanyEmployeePage({ params, searchParams }: Props) {
  if (!isInternalAiCompanyEnabled()) {
    return (
      <div className="hq-grid min-h-screen">
        <main className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">AI Company unavailable</h1>
          <Link href="/dashboard" className="mt-6 inline-block text-sm text-[var(--hq-signal)]">
            Back to WorkPilot →
          </Link>
        </main>
      </div>
    );
  }

  const { id } = await params;
  const qs = searchParams ? await searchParams : {};
  const workspaceId = qs.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const profile = await getAiCompanyEmployeeProfile(id);
  if (!profile) notFound();

  return (
    <HqShellPage workspaceId={workspaceId}>
      <div className="mx-auto max-w-6xl">
        <AiCompanyEmployeeProfileView profile={profile} />
      </div>
    </HqShellPage>
  );
}
