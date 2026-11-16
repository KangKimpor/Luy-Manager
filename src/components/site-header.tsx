"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ChevronLeft, Settings } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { isFormRoute } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Navigation bar and in-flow large screen title.
 *
 * Phone screens use a transparent top bar carrying circular glass controls
 * (Back on sub routes, Settings on the right everywhere except /settings) plus a
 * headline inline title that fades in once the in-flow large title scrolls under
 * the bar. Form routes use a compact variant with only the Back button and the
 * centered headline <h1>, omitting the large title and Settings gear. Only one
 * <h1> renders per screen.
 */

const ROOT_TITLES: Record<string, string> = {
  "/": "Home",
  "/transactions": "Activity",
  "/budgets": "Budgets",
  "/reports": "Insights",
};

const SUB_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/reports\/overall$/, "Overall report"],
  [/^\/accounts$/, "Accounts"],
  [/^\/accounts\/new$/, "Add account"],
  [/^\/accounts\/[^/]+\/edit$/, "Edit account"],
  [/^\/budgets\/new$/, "New budget"],
  [/^\/add$/, "Add transaction"],
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

  return { title: "Luy Manager", isRoot: false };
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const resolved = resolveTitle(pathname);
  const compact = resolved !== null && isFormRoute(pathname);

  useEffect(() => {
    if (!resolved || compact) return;

    function updateFromScroll() {
      const target = titleRef.current;
      if (!target) {
        setScrolled(window.scrollY > 36);
        return;
      }
      const rect = target.getBoundingClientRect();
      setScrolled(rect.bottom <= 52);
    }

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateFromScroll);
  }, [pathname, resolved, compact]);

  if (!resolved) return null;

  const { title, isRoot } = resolved;
  const showSettingsButton = !compact && pathname !== "/settings";

  const backButton = !isRoot ? (
    <button
      type="button"
      onClick={() =>
        window.history.length > 1
          ? router.back()
          : router.push(pathname === "/reports/overall" ? "/reports" : "/")
      }
      aria-label="Go back"
      className="icon-btn"
    >
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  ) : null;

  if (compact) {
    return (
      <header className="topbar app-chrome-header is-compact">
        <div className="topbar-left">{backButton}</div>
        <h1 className="topbar-inline-title">{title}</h1>
        <div className="topbar-actions" />
      </header>
    );
  }

  return (
    <>
      <div className={cn("scroll-edge", scrolled && "is-scrolled")} aria-hidden="true" />
      <header className={cn("topbar app-chrome-header", scrolled && "is-scrolled")}>
        <div className="topbar-left">{backButton}</div>

        <span className="topbar-inline-title" aria-hidden="true">
          {title}
        </span>

        <div className="topbar-actions">
          {showSettingsButton ? (
            <Link href="/settings" aria-label="Settings" className="icon-btn">
              <Settings size={19} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </header>

      <div ref={titleRef} className="screen-head-flow mx-auto max-w-[1120px]">
        <h1 className="large-title-h1">{title}</h1>
      </div>
    </>
  );
}
