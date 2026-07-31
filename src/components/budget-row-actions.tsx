"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteBudget } from "@/app/actions/budgets";

export function BudgetRowActions({
  budgetId,
  name,
}: {
  budgetId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm(`Remove the ${name} budget?`)) return;

    startTransition(async () => {
      const result = await deleteBudget(budgetId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {error ? (
        <span role="alert" className="text-outflow max-w-32 text-xs">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Remove the ${name} budget`}
        className="text-ink-faint hover:text-outflow flex size-8 items-center justify-center disabled:opacity-40"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
