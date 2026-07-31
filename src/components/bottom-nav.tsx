"use client";

import { LayoutDashboard, PieChart, Plus, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Fixed bottom navigation with a raised centre action.
 *
 * PRD Section 15 specifies Dashboard, Accounts, Add, Budgets, Reports with a
 * floating quick-add. The layout follows the custom bottom bar from the
 * fitness_app reference template: four flat destinations with the primary action
 * lifted out of the bar so it is reachable by thumb without hunting.
 *
 * "Add" is a route rather than a modal so the quick-add survives a page refresh
 * and can be shared as a link, which also makes it linkable from the Telegram
 * bot in PRD Section 9.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LEFT_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
];

const RIGHT_ITEMS: NavItem[] = [
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/reports", label: "Reports", icon: LayoutDashboard },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors",
        active ? "text-brand" : "text-ink-faint hover:text-ink-muted",
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const addActive = isActive(pathname, "/add");

  return (
    <nav
      aria-label="Main"
      className="border-border-subtle bg-surface fixed inset-x-0 bottom-0 z-40 border-t"
      // Keeps the bar clear of the iOS home indicator.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-navbar max-w-lg items-center px-2">
        {LEFT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        {/* Centre action, lifted above the bar. */}
        <div className="flex flex-1 justify-center">
          <Link
            href="/add"
            aria-label="Add transaction"
            aria-current={addActive ? "page" : undefined}
            className={cn(
              "shadow-fab -mt-7 flex size-14 items-center justify-center rounded-full text-white transition-transform active:scale-95",
              addActive ? "bg-brand-strong" : "bg-brand",
            )}
          >
            <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
          </Link>
        </div>

        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}
