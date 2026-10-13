import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const { link } = vi.hoisted(() => ({ link: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean | null }) => {
    link(prefetch);
    return <a {...props}>{children}</a>;
  },
  useLinkStatus: () => ({ pending: false }),
}));
import { AppLink } from "./app-link";

afterEach(() => { cleanup(); link.mockClear(); });

test("uses Next's shell prefetch default and preserves explicit opt-outs", () => {
  render(<AppLink href="/reports">Reports</AppLink>);
  expect(link).toHaveBeenLastCalledWith(undefined);
  render(<AppLink href="/transactions" prefetch={false}>Activity</AppLink>);
  expect(link).toHaveBeenLastCalledWith(false);
});
