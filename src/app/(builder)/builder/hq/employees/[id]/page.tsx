import { notFound } from "next/navigation";
import Link from "next/link";
import { isInternalAiCompanyEnabled } from "@/services/builder/internal-ai-company";
import { getAiCompanyEmployeeProfile } from "@/services/builder/company.service";
import { AiCompanyEmployeeProfileView } from "@/features/builder/components/ai-company-employee-profile";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AiCompanyEmployeePage({ params }: Props) {
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
  const profile = await getAiCompanyEmployeeProfile(id);
  if (!profile) notFound();

  return (
    <div className="hq-grid min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <AiCompanyEmployeeProfileView profile={profile} />
      </main>
    </div>
  );
}
