"use client";

import { ArrowLeft, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Fixed top app bar.
 *
 * Two variants, chosen by route depth rather than by a prop, so no page has to
 * remember to declare which one it wants:
 *
 *   Top-level destination -> app mark, screen name, and a link to settings.
 *   Anything deeper       -> back button and the screen name.
 *
 * The title lives here rather than in each page because it was previously
 * repeated: the Stitch mockups showed "Accounts" in the bar and again as a
 * heading immediately below it. One h1 per screen, rendered once, in the bar.
 *
 * Hidden entirely on /login, which is a full-bleed screen with nothing to
 * navigate back to and no session to reach settings with.
 */

/** Routes that are destinations in their own right, so no back affordance. */
const ROOT_TITLES: Record<string, string> = {
  "/": "Home",
  "/accounts": "Accounts",
  "/budgets": "Budgets",
  "/reports": "Reports",
  "/transactions": "Activity",
  "/more": "More",
};

/** Deeper routes, matched most specific first. */
const SUB_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/add$/, "Add transaction"],
  [/^\/accounts\/new$/, "Add account"],
  [/^\/accounts\/[^/]+\/edit$/, "Edit account"],
  [/^\/budgets\/new$/, "New budget"],
  [/^\/transactions\/[^/]+\/edit$/, "Edit transaction"],
  [/^\/settings$/, "Settings"],
];

function resolveTitle(pathname: string): { title: string; isRoot: boolean } | null {
  if (pathname === "/login") return null;

  const root = ROOT_TITLES[pathname];
  if (root) return { title: root, isRoot: true };

  for (const [pattern, title] of SUB_TITLES) {
    if (pattern.test(pathname)) return { title, isRoot: false };
  }

  // An unmapped route still gets a bar with a way back, which is better than a
  // screen that looks broken because its chrome vanished.
  return { title: "Luy Manager", isRoot: false };
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const resolved = resolveTitle(pathname);
  if (!resolved) return null;

  const { title, isRoot } = resolved;

  return (
    <header className="bg-surface-muted pt-safe fixed inset-x-0 top-0 z-40 lg:left-60">
      <div className="mx-auto flex h-appbar max-w-xl items-center justify-between gap-3 px-5 lg:max-w-none lg:px-10 xl:px-14">
        <div className="flex min-w-0 items-center gap-3">
          {isRoot ? (
            <span className="bg-brand text-surface flex size-10 shrink-0 items-center justify-center rounded-2xl shadow-fab lg:hidden"><Wallet size={21} aria-hidden="true" /></span>
          ) : (
            <button
              type="button"
              onClick={() => window.history.length > 1 ? router.back() : router.push("/")}
              aria-label="Go back"
              className="text-ink-muted hover:bg-surface-container -ml-2 flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          )}

          <div className="min-w-0">
            <p className="text-ink-faint mb-0.5 text-[10px] font-semibold tracking-[0.15em] uppercase">Luy Manager</p>
            <h1 className="text-headline-md text-ink truncate tracking-tight lg:text-2xl">{title}</h1>
          </div>
        </div>

        {isRoot ? (
          <Link
            href="/settings"
            aria-label="Settings"
            className="card-interactive bg-surface text-ink-muted border-surface-variant hover:text-brand flex size-11 shrink-0 items-center justify-center rounded-2xl border"
          >
            <Settings size={19} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </header>
  );
}
