"use client";

import { Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MAIN_NAV, MORE_NAV, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <aside className="bg-surface border-surface-variant fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r px-5 py-8 lg:flex">
      <Link href="/" className="text-ink mb-10 flex items-center gap-3 px-2 text-lg font-bold tracking-tight">
        <span className="bg-brand text-surface flex size-9 items-center justify-center rounded-xl"><Wallet size={19} aria-hidden="true" /></span>Luy Manager
      </Link>
      <Link href="/add" className="bg-brand text-surface hover:bg-brand-strong mb-8 flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors"><Plus size={18} aria-hidden="true" />Add transaction</Link>
      <nav aria-label="Main" className="space-y-1">
        {[...MAIN_NAV.filter(item => item.href !== "/more"), ...MORE_NAV].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isNavActive(pathname, href) ? "page" : undefined}
            className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", isNavActive(pathname, href) ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
            <Icon size={19} aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>
      <p className="text-ink-faint mt-auto px-3 text-xs leading-relaxed">Your money.<br />A little clearer.</p>
    </aside>
  );
}
