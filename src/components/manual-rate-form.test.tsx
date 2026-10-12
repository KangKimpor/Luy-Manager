import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualRateForm } from "./manual-rate-form";

const { clearManualRate, setManualRate, refresh } = vi.hoisted(() => ({
  clearManualRate: vi.fn(), setManualRate: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/app/actions/rates", () => ({ clearManualRate, setManualRate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  clearManualRate.mockReset();
  setManualRate.mockReset();
  refresh.mockReset();
});

describe("manual rate feedback", () => {
  it("shows reset progress on Reset and prevents a second action until it finishes", async () => {
    let finish!: (result: { ok: true }) => void;
    clearManualRate.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<ManualRateForm currentRate={4100} />);
    await user.type(screen.getByLabelText("Riel per $1"), "4050");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    const reset = screen.getByRole("button", { name: "Resetting..." });
    expect(reset).toBeDisabled();
    expect(reset).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Use my rate" })).toBeDisabled();
    await user.click(reset);
    expect(clearManualRate).toHaveBeenCalledTimes(1);
    expect(setManualRate).not.toHaveBeenCalled();

    await act(async () => finish({ ok: true }));
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use my rate" })).toBeEnabled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the entered rate and releases busy controls when a save fails", async () => {
    let fail!: (reason: Error) => void;
    setManualRate.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    const user = userEvent.setup();
    render(<ManualRateForm currentRate={4100} />);
    await user.type(screen.getByLabelText("Riel per $1"), "4050");
    await user.click(screen.getByRole("button", { name: "Use my rate" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();

    await act(async () => fail(new Error("network")));
    expect(screen.getByRole("alert")).toHaveTextContent("Check recent exchange rates");
    expect(screen.getByLabelText("Riel per $1")).toHaveValue("4050");
    expect(screen.getByRole("button", { name: "Use my rate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
