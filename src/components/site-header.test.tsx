import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/reports/overall", useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("./app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { SiteHeader } from "./site-header";

test("the overall report has its own title and back control", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Overall report");
  expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
});
