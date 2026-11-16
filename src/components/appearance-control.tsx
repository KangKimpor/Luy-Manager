"use client";

import { useOptimistic, useState, useTransition } from "react";

import { setAppearance } from "@/app/actions/appearance";
import type { Appearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const APPEARANCE_OPTIONS: readonly { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * Switches the app's light/dark appearance preference.
 *
 * Optimistic so the sliding thumb moves immediately while the server action
 * persists the cookie and re-renders `<html data-theme="...">`.
 */
export function AppearanceControl({
  current,
  className,
}: {
  current: Appearance;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [error, setError] = useState(false);

  function choose(appearance: Appearance) {
    if (appearance === optimistic || isPending) return;

    startTransition(async () => {
      setOptimistic(appearance);
      setError(false);
      try {
        await setAppearance(appearance);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div
        role="group"
        aria-label="Appearance"
        aria-busy={isPending}
        className={cn(
          "segmented-control segmented-control-three rounded-pill bg-fill h-9 items-center transition-opacity",
          isPending && "opacity-70",
          className,
        )}
      >
        {APPEARANCE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={optimistic === value}
            disabled={isPending}
            onClick={() => choose(value)}
            className={cn(
              "rounded-pill relative z-10 min-w-[68px] px-3 text-[13px] leading-[18px] tracking-[-0.006em] before:absolute before:-inset-y-1.5 before:inset-x-0 before:rounded-pill",
              optimistic === value
                ? "text-ink font-semibold"
                : "text-ink-muted hover:text-ink font-medium",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="feedback-enter text-outflow text-xs">
          Could not change appearance. Try again.
        </p>
      ) : null}
    </div>
  );
}
