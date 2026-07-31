"use client";

import type { ReactNode } from "react";
import { HqShell } from "@/features/builder/components/hq-shell";

type Props = {
  workspaceId: string;
  approvalCount?: number;
  children: ReactNode;
};

/** Shared dark HQ chrome for non–Live-Office routes (Employees, Integrations, Settings). */
export function HqShellPage({ workspaceId, approvalCount = 0, children }: Props) {
  return (
    <HqShell workspaceId={workspaceId} approvalCount={approvalCount}>
      <div className="hq-subpage">{children}</div>
    </HqShell>
  );
}
