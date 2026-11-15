"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { Plus } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { MAIN_NAV, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    if (pathname === "/login") return;
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) return;

    lastYRef.current = window.scrollY;

    let rafId = 0;
    function onScroll() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const y = window.scrollY;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

        if (y < 40 || (maxScroll > 0 && y >= maxScroll - 24)) {
          setCollapsed(false);
        } else {
          const delta = y - lastYRef.current;
          if (delta > 6) setCollapsed(true);
          else if (delta < -6) setCollapsed(false);
        }
        lastYRef.current = y;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [pathname]);

  if (pathname === "/login") return null;

  const activeIndex = MAIN_NAV.findIndex((item) => isNavActive(pathname, item.href));

  return (
    <nav
      aria-label="Main"
      className={cn("floating-dock app-chrome-nav lg:hidden", collapsed && "is-collapsed")}
    >
      <div className="tab-capsule">
        <span
          className="tab-indicator"
          aria-hidden="true"
          style={{
            opacity: activeIndex >= 0 ? 1 : 0,
            transform: `translateX(${Math.max(0, activeIndex) * 100}%)`,
          }}
        />
        {MAIN_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="bnav-item"
            >
              <Icon size={20} aria-hidden="true" />
              <span className="bnav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <Link
        href="/add"
        prefetch={true}
        aria-label="Add transaction"
        aria-current={pathname === "/add" ? "page" : undefined}
        className="dock-add-btn"
      >
        <Plus size={22} aria-hidden="true" />
      </Link>
    </nav>
  );
}
