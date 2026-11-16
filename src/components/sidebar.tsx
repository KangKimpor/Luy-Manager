"use client";

import { usePathname } from "next/navigation";

import { Plus } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { SIDEBAR_NAV, isNavActive } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="app-chrome-sidebar sidebar-glass fixed inset-y-0 left-0 z-50 hidden w-60 flex-col px-4 py-6 lg:flex">
      <Link href="/" className="text-ink mb-6 flex items-center gap-2.5 rounded-xl px-2 py-1 text-lg font-bold tracking-tight">
        <span className="brand-mark-tile" aria-hidden="true">L</span>
        <span>Luy Manager</span>
      </Link>

      <Link href="/add" className="sidebar-add-btn mb-5">
        <Plus size={18} aria-hidden="true" />
        <span>Add transaction</span>
      </Link>

      <nav aria-label="Main" className="space-y-1">
        {SIDEBAR_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isNavActive(pathname, href) ? "page" : undefined}
            className="side-nav-item"
          >
            <Icon size={19} className="nav-icon" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
