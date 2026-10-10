"use client";

import { Plus } from "lucide-react";
import { AppLink as Link } from "@/components/app-link";
import { usePathname } from "next/navigation";

import { MAIN_NAV, isNavActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav aria-label="Main" className="bg-surface border-surface-variant pb-safe px-safe shadow-nav fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t lg:hidden">
      <div className="mx-auto grid h-navbar max-w-xl grid-cols-5 items-center px-2">
        {MAIN_NAV.map((item, index) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link prefetch={true} key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={cn("row-start-1 flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors", active ? "text-brand" : "text-ink-faint hover:text-ink")}
              style={{ gridColumn: index >= 2 ? index + 2 : index + 1 }}>
              <span className={cn("nav-icon flex h-8 w-12 items-center justify-center rounded-xl", active && "bg-brand-soft")}><Icon size={21} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" /></span>
              {item.label}
            </Link>
          );
        })}
        <Link prefetch={true} href="/add" aria-label="Add transaction" aria-current={pathname === "/add" ? "page" : undefined}
          className="bg-brand text-surface shadow-fab col-start-3 row-start-1 mx-auto flex size-13 items-center justify-center rounded-[1.1rem] transition-transform active:scale-90">
          <Plus size={25} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
