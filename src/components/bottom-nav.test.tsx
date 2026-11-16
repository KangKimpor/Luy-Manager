import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));
vi.mock("./app-link", () => ({
  AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

import { BottomNav } from "./bottom-nav";

beforeEach(() => {
  mockPathname.mockReturnValue("/");
});

test("renders on main and non-form routes", () => {
  for (const path of ["/", "/transactions", "/budgets", "/reports", "/reports/overall", "/accounts", "/settings"]) {
    mockPathname.mockReturnValue(path);
    const { unmount } = render(<BottomNav />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add transaction" })).toHaveAttribute("href", "/add");
    unmount();
  }
});

test("hides on /login and every form route", () => {
  for (const path of [
    "/login",
    "/add",
    "/transactions/tx-1/edit",
    "/accounts/new",
    "/accounts/acc-1/edit",
    "/budgets/new",
  ]) {
    mockPathname.mockReturnValue(path);
    const { container, unmount } = render(<BottomNav />);
    expect(container).toBeEmptyDOMElement();
    unmount();
  }
});
