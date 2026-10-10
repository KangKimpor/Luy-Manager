"use client";

import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useEffect, useRef } from "react";

const DESTINATIONS = ["/", "/add", "/transactions", "/accounts", "/more", "/budgets", "/reports", "/settings", "/accounts/new", "/budgets/new"];

/** Warm routes hidden behind More on phones, including their dynamic page data. */
export function NavigationPreload() {
  const router = useRouter();
  const pathname = usePathname();
  const warmed = useRef(new Set<string>());

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/auth")) { warmed.current.clear(); return; }
    if (process.env.NODE_ENV !== "production") return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();
    const warm = () => {
      if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
      for (const href of DESTINATIONS) {
        if (href === pathname || warmed.current.has(href)) continue;
        warmed.current.add(href);
        // AUTO stops at loading.tsx. FULL also fetches the figures and form options.
        router.prefetch(href, { kind: PrefetchKind.FULL, onInvalidate: () => {
          warmed.current.delete(href);
          if (!stopped && Date.now() - lastActivity < 60_000) schedule();
        } });
      }
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(warm, 350);
    };
    const activity = () => { lastActivity = Date.now(); schedule(); };
    schedule();
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener("online", activity);
    document.addEventListener("visibilitychange", activity);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("online", activity);
      document.removeEventListener("visibilitychange", activity);
    };
  }, [pathname, router]);
  return null;
}
