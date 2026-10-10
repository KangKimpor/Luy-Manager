"use client";

import { Plus, Wallet } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { usePathname } from "next/navigation";

import { MAIN_NAV, MORE_NAV, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <aside className="bg-surface border-surface-variant fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r px-5 py-8 lg:flex">
      <Link prefetch={true} href="/" className="text-ink mb-10 flex items-center gap-3 px-2 text-lg font-bold tracking-tight">
        <span className="bg-brand text-surface shadow-fab flex size-10 items-center justify-center rounded-2xl"><Wallet size={20} aria-hidden="true" /></span>Luy Manager
      </Link>
      <Link prefetch={true} href="/add" className="bg-brand text-surface hover:bg-brand-strong hover:shadow-fab mb-8 flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all active:scale-95"><Plus size={18} aria-hidden="true" />Add transaction</Link>
      <nav aria-label="Main" className="space-y-1">
        {[...MAIN_NAV.filter(item => item.href !== "/more"), ...MORE_NAV].map(({ href, label, icon: Icon }) => (
          <Link prefetch={true} key={href} href={href} aria-current={isNavActive(pathname, href) ? "page" : undefined}
            className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", isNavActive(pathname, href) ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
            <Icon size={19} className="nav-icon" aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>
      <div className="bg-surface-muted rounded-2xl mt-auto p-4"><p className="text-ink text-sm font-semibold">A little clearer.</p><p className="text-ink-muted mt-1 text-xs leading-relaxed">Dollars and riel.<br />One place for your money.</p></div>
    </aside>
  );
}
