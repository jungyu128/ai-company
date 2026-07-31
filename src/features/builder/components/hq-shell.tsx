"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  /** Real app route when available. */
  href?: string;
  /** Ops panel anchor opened as overlay (preserves existing ops content). */
  opsId?: string;
  match?: "exact" | "prefix";
};

/**
 * Reference sidebar labels → existing HQ routes / ops sections.
 * No new routes; hash ops targets open the ops overlay.
 */
const NAV: NavItem[] = [
  { id: "overview", label: "HQ Overview", href: "/builder/hq", match: "exact" },
  { id: "employees", label: "Employees", href: "/builder/hq/employees/sarah", match: "prefix" },
  { id: "tasks", label: "Tasks", opsId: "ops-command" },
  { id: "projects", label: "Projects", opsId: "ops-collaborations" },
  { id: "knowledge", label: "Knowledge", opsId: "ops-memory" },
  { id: "communications", label: "Communications", opsId: "ops-activity" },
  { id: "calendar", label: "Calendar", opsId: "ops-workday" },
  { id: "analytics", label: "Analytics", opsId: "ops-analytics" },
  { id: "approvals", label: "Approvals", opsId: "ops-approvals" },
  { id: "integrations", label: "Integrations", href: "/builder/hq/repository", match: "prefix" },
  { id: "settings", label: "Settings", href: "/builder/hq/onboarding", match: "prefix" },
];

type Props = {
  workspaceId: string;
  live?: boolean;
  onlineCount?: number;
  approvalCount?: number;
  children: ReactNode;
  ops?: ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  // Employees link lands on a default profile but should stay active for any employee.
  if (item.id === "employees") {
    return pathname.startsWith("/builder/hq/employees");
  }
  if (item.match === "exact") {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname.startsWith(item.href);
}

export function HqShell({
  workspaceId,
  live,
  onlineCount = 0,
  approvalCount = 0,
  children,
  ops,
}: Props) {
  const pathname = usePathname() || "/builder/hq";
  const qs = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [opsOpen, setOpsOpen] = useState(false);
  const [opsTarget, setOpsTarget] = useState<string | null>(null);

  useEffect(() => {
    function syncFromHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash.startsWith("ops")) {
        setOpsOpen(true);
        setOpsTarget(hash);
        window.requestAnimationFrame(() => {
          document.getElementById(hash)?.scrollIntoView({ block: "start" });
        });
      }
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function openOps(opsId: string) {
    setOpsOpen(true);
    setOpsTarget(opsId);
    window.history.replaceState(null, "", `#${opsId}`);
    window.requestAnimationFrame(() => {
      document.getElementById(opsId)?.scrollIntoView({ block: "start" });
    });
  }

  function closeOps() {
    setOpsOpen(false);
    setOpsTarget(null);
    if (window.location.hash.startsWith("#ops")) {
      window.history.replaceState(null, "", `${pathname}${qs}`);
    }
  }

  return (
    <div className="hq-shell">
      <aside className="hq-sidebar" aria-label="AI Company navigation">
        <div className="hq-sidebar__top">
          <p className="hq-sidebar__product">AI Company HQ</p>
          <p className="hq-sidebar__live-line">
            <span className={`hq-live-dot${live ? "" : " hq-live-dot--off"}`} />
            <span>
              Live · {onlineCount} online
            </span>
          </p>
        </div>

        <nav className="hq-sidebar__nav">
          {NAV.map((item) => {
            const active =
              isActive(pathname, item) ||
              (opsOpen && item.opsId != null && opsTarget === item.opsId);
            const badge = item.id === "approvals" ? approvalCount : 0;
            const className = `hq-sidebar__link${active ? " hq-sidebar__link--active" : ""}`;
            const content = (
              <>
                <span className={`hq-nav-glyph hq-nav-glyph--${item.id}`} aria-hidden />
                <span className="hq-sidebar__link-label">{item.label}</span>
                {badge > 0 ? <span className="hq-sidebar__badge">{badge}</span> : null}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={`${item.href}${qs}`}
                  className={className}
                  onClick={() => setOpsOpen(false)}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={className}
                onClick={() => openOps(item.opsId ?? "ops-approvals")}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <div className="hq-sidebar__ceo">
          <span className="hq-sidebar__ceo-avatar" aria-hidden>
            CEO
          </span>
          <div className="min-w-0">
            <p className="hq-sidebar__ceo-name">CEO Junkyu Kang</p>
            <p className="hq-sidebar__ceo-role">
              <span className="hq-live-dot" /> Online
            </p>
          </div>
        </div>
      </aside>

      <div className="hq-shell__column">
        <div className="hq-shell__stage">{children}</div>

        <footer className="hq-status">
          <span className="hq-status__left">
            <span className="hq-live-dot" />
            AI Company HQ · All systems operational
          </span>
          <span className="hq-status__right">
            <button
              type="button"
              className="hq-status__ops"
              onClick={() => openOps(opsTarget ?? "ops-approvals")}
            >
              Operations
            </button>
            <span className="hq-status__sync">Last sync: Just now</span>
          </span>
        </footer>
      </div>

      {ops ? (
        <div
          className={`hq-ops-overlay${opsOpen ? " hq-ops-overlay--open" : ""}`}
          aria-hidden={!opsOpen}
        >
          <button
            type="button"
            className="hq-ops-overlay__backdrop"
            aria-label="Close operations"
            onClick={closeOps}
          />
          <aside className="hq-ops-overlay__panel" aria-label="Operations">
            <div className="hq-ops-overlay__head">
              <div>
                <p className="hq-ops-overlay__eyebrow">Operations</p>
                <h2 className="hq-ops-overlay__title">Approvals · Command · Memory</h2>
              </div>
              <button type="button" className="hq-ops-overlay__close" onClick={closeOps}>
                Close
              </button>
            </div>
            <div className="hq-ops-overlay__body hq-ops-panels">{ops}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
