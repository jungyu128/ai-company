"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  href?: string;
  hash?: string;
  match?: "exact" | "prefix";
  badge?: number;
};

const NAV: NavItem[] = [
  { id: "office", label: "Live Office", href: "/builder/hq", match: "exact" },
  { id: "briefing", label: "CEO Briefing", hash: "ops" },
  { id: "employees", label: "Employees", hash: "ops" },
  { id: "missions", label: "Missions", hash: "ops" },
  { id: "approvals", label: "Approvals", hash: "ops", badge: 2 },
  { id: "documents", label: "Documents", href: "/builder/hq/repository", match: "prefix" },
  { id: "email", label: "Email", hash: "ops" },
  { id: "workflows", label: "Workflows", hash: "ops" },
  { id: "analytics", label: "Analytics", hash: "ops" },
  { id: "settings", label: "Settings", href: "/builder/hq/onboarding", match: "prefix" },
];

type Props = {
  workspaceId: string;
  headline?: string;
  live?: boolean;
  healthLabel?: string;
  approvalCount?: number;
  children: ReactNode;
  ops?: ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  if (item.match === "exact") {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname.startsWith(item.href);
}

export function HqShell({
  workspaceId,
  live,
  approvalCount = 0,
  children,
  ops,
}: Props) {
  const pathname = usePathname() || "/builder/hq";
  const qs = `?workspaceId=${encodeURIComponent(workspaceId)}`;

  return (
    <div className="hq-shell">
      <aside className="hq-sidebar" aria-label="AI Company navigation">
        <div className="hq-sidebar__top">
          <div className="hq-sidebar__brand-row">
            <span className="hq-sidebar__mark" aria-hidden />
            <div>
              <p className="hq-sidebar__product">AI Company HQ</p>
              <p className="hq-sidebar__live-line">
                <span className={`hq-live-dot${live ? "" : " hq-live-dot--off"}`} />
                Live Office
              </p>
            </div>
          </div>
        </div>

        <nav className="hq-sidebar__nav">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const badge = item.id === "approvals" ? approvalCount : item.badge;
            const className = `hq-sidebar__link${active ? " hq-sidebar__link--active" : ""}`;
            const content = (
              <>
                <span className={`hq-nav-glyph hq-nav-glyph--${item.id}`} aria-hidden />
                <span className="hq-sidebar__link-label">{item.label}</span>
                {badge && badge > 0 ? (
                  <span className="hq-sidebar__badge">{badge}</span>
                ) : null}
              </>
            );

            if (item.href) {
              return (
                <Link key={item.id} href={`${item.href}${qs}`} className={className}>
                  {content}
                </Link>
              );
            }

            return (
              <a key={item.id} href={`#${item.hash ?? "ops"}`} className={className}>
                {content}
              </a>
            );
          })}
        </nav>

        <div className="hq-sidebar__ceo">
          <span className="hq-sidebar__ceo-avatar" aria-hidden>
            CEO
          </span>
          <div className="min-w-0">
            <p className="hq-sidebar__ceo-name">CEO</p>
            <p className="hq-sidebar__ceo-role">Owner</p>
          </div>
        </div>
      </aside>

      <div className="hq-shell__stage">{children}</div>

      {ops ? (
        <details id="ops" className="hq-ops-drawer">
          <summary className="hq-ops-drawer__summary">
            Operations · Approvals · Command Center
          </summary>
          <div className="hq-ops-drawer__body">{ops}</div>
        </details>
      ) : null}
    </div>
  );
}
