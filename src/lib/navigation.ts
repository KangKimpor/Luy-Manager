import { ChartNoAxesColumn, Ellipsis, House, List, PieChart, Settings, Wallet } from "lucide-react";

export const MAIN_NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/transactions", label: "Activity", icon: List },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/more", label: "More", icon: Ellipsis },
] as const;

export const MORE_NAV = [
  { href: "/budgets", label: "Budgets", description: "Stay on top of your spending", icon: PieChart },
  { href: "/reports", label: "Reports", description: "See how your money moves", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", description: "Currency, exchange rate and Telegram", icon: Settings },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/more") return pathname === "/more" || MORE_NAV.some((item) => isNavActive(pathname, item.href));
  return pathname === href || pathname.startsWith(`${href}/`);
}
