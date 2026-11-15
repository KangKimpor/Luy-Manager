import { ChartNoAxesColumn, ExpenseList, House, PieChart, Settings, Wallet } from "@/components/app-icon";

export const MAIN_NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/transactions", label: "Activity", icon: ExpenseList },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/reports", label: "Insights", icon: ChartNoAxesColumn },
] as const;

export const SIDEBAR_NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/transactions", label: "Activity", icon: ExpenseList },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/reports", label: "Insights", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
