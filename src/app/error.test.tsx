import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import ErrorPage from "./error";
import GlobalError from "./global-error";

it("re-fetches failed content through Next's retry on both error screens", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const error = new Error("Temporary loading failure");
  const unstable_retry = vi.fn();
  const page = render(<ErrorPage error={error} unstable_retry={unstable_retry} />);
  fireEvent.click(page.getByRole("button", { name: "Try again" }));
  expect(unstable_retry).toHaveBeenCalledOnce();
  page.unmount();

  // Global errors replace the document, including html and body.
  const global = render(<GlobalError error={error} unstable_retry={unstable_retry} />, {
    container: document.documentElement,
  });
  fireEvent.click(global.getByRole("button", { name: "Reload" }));
  expect(unstable_retry).toHaveBeenCalledTimes(2);
});
