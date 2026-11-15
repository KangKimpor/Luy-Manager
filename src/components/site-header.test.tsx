import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => "/reports/overall") }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("./app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { SiteHeader } from "./site-header";

beforeEach(() => {
  mockPathname.mockReturnValue("/reports/overall");
});

test("the overall report has its own title and back control", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Overall report");
  expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
});

test("maps /reports to Insights as a root route and /accounts as a sub route", () => {
  mockPathname.mockReturnValue("/reports");
  const { rerender } = render(<SiteHeader />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Insights");
  expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();

  mockPathname.mockReturnValue("/accounts");
  rerender(<SiteHeader />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Accounts");
  expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();

  mockPathname.mockReturnValue("/settings");
  rerender(<SiteHeader />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
  expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
});
