import { cloneElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { money } from "@/lib/money";
import { CHART_COLORS } from "@/lib/theme";
import { CategoryDonut } from "./category-donut";

vi.mock("recharts", async (importOriginal) => ({
  ...await importOriginal<typeof import("recharts")>(),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) => cloneElement(children, { width: 320, height: 288 }),
}));

it("labels readable slices and describes even the smallest slice accessibly", () => {
  render(<CategoryDonut total={money(10000, "USD")} label="Total spent" slices={[
    { name: "Food", share: 0.65, color: CHART_COLORS.categories[0], total: money(6500, "USD"), transactionCount: 10 },
    { name: "Home", share: 0.32, color: CHART_COLORS.categories[1], total: money(3200, "USD"), transactionCount: 2 },
    { name: "Other", share: 0.03, color: CHART_COLORS.categories[2], total: money(300, "USD"), transactionCount: 1 },
  ]} />);
  expect(screen.getByText("65%")).toBeInTheDocument();
  expect(screen.getByText("32%")).toBeInTheDocument();
  expect(screen.queryByText("3%")).not.toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAccessibleName(/Other: \$3.00, 3.0%, 1 transactions/);
});

it("renders a single category as the full total", () => {
  render(<CategoryDonut total={money(500, "USD")} label="Total received" slices={[
    { name: "Salary", share: 1, color: CHART_COLORS.categories[0], total: money(500, "USD"), transactionCount: 1 },
  ]} />);
  expect(screen.getByText("100%")).toBeInTheDocument();
  expect(screen.getByText("$5.00")).toBeInTheDocument();
});
