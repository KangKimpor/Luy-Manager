import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("./app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { Sidebar } from "./sidebar";

test("retains every desktop destination and add action without the blurb", () => {
  render(<Sidebar />);
  for (const label of ["Home", "Activity", "Accounts", "Budgets", "Reports", "Settings", "Add transaction"]) {
    expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  }
  expect(screen.queryByText("A little clearer.")).not.toBeInTheDocument();
});
