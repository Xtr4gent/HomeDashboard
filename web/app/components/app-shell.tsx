import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "@/app/components/theme-toggle";

type ActiveNav = "dashboard" | "planner" | "budget" | "projections" | "upgrades";

type Props = {
  title: string;
  username: string;
  activeNav: ActiveNav;
  children: ReactNode;
};

const shellTheme = {
  "--app-bg": "#eef2f8",
  "--app-surface": "#f8fafc",
  "--app-foreground": "#0f172a",
  "--app-muted": "#64748b",
  "--app-accent": "#2563eb",
  "--app-border": "#dbe2ee",
  "--app-success": "#15803d",
  "--app-warning": "#c2410c",
  "--app-error": "#b91c1c",
  "--app-info": "#1d4ed8",
} as CSSProperties;

function navClass(isActive: boolean): string {
  if (isActive) {
    return "block rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white";
  }
  return "block rounded-xl px-3 py-2 text-slate-600 transition hover:bg-white hover:text-slate-900";
}

export function AppShell({ title, username, activeNav, children }: Props) {
  return (
    <div className="min-h-screen bg-[var(--app-shell-bg)] text-[color:var(--app-foreground)] transition-colors">
      <div
        style={shellTheme}
        className="grid min-h-screen w-full overflow-hidden border border-[color:var(--app-border)] bg-[color:var(--app-surface)] shadow-[0_40px_100px_rgba(2,6,23,0.45)] lg:grid-cols-[260px_1fr] 2xl:grid-cols-[290px_1fr]"
      >
        <aside className="flex flex-col border-r border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-3 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              HD
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--app-foreground)]">HomeDashboard</p>
              <p className="text-xs text-[color:var(--app-muted)]">Charts version</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1 text-sm">
            <Link href="/" className={navClass(activeNav === "dashboard")}>
              Dashboard
            </Link>
            <Link href="/planner" className={navClass(activeNav === "planner")}>
              Our Home
            </Link>
            <Link href="/projections" className={navClass(activeNav === "projections")}>
              Projections
            </Link>
            <Link href="/upgrades" className={navClass(activeNav === "upgrades")}>
              Upgrades
            </Link>
            <Link href="/budget" className={navClass(activeNav === "budget")}>
              Budget
            </Link>
          </nav>

          <div className="mt-auto rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-3">
            <p className="text-xs text-[color:var(--app-muted)]">Signed in as</p>
            <p className="text-sm font-semibold text-[color:var(--app-foreground)]">{username}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-[color:var(--app-border)] bg-[color:var(--app-panel-soft)] px-4 py-4 backdrop-blur sm:px-6 xl:px-8 2xl:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full max-w-xl">
                <label className="sr-only" htmlFor="globalSearch">
                  Search
                </label>
                <input
                  id="globalSearch"
                  placeholder={`Search ${title.toLowerCase()}...`}
                  className="w-full rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] px-4 py-2 text-sm text-[color:var(--app-foreground)] shadow-sm outline-none transition focus:border-blue-300"
                />
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-panel)] p-1 text-xs font-semibold text-[color:var(--app-muted)]">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-white">Today</span>
                <span className="rounded-full px-3 py-1">Week</span>
                <span className="rounded-full px-3 py-1">Month</span>
                <span className="rounded-full px-3 py-1">Year</span>
              </div>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex w-full min-w-0 flex-col bg-[color:var(--app-bg)] px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
