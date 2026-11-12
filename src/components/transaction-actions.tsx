"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTransaction, restoreTransaction } from "@/app/actions/transactions";
import { withActionFeedback } from "@/lib/action-feedback";

/**
 * One event listener for every ledger row.
 *
 * Previously each row mounted its own client component just to hold two buttons.
 * A long day meant dozens of separate client boundaries. The rows are now plain
 * server output with data attributes, and this single wrapper delegates clicks
 * from all of them.
 */
export function TransactionActions({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-transaction-action]");
    if (!target || pending) return;
    const id = target.dataset.transactionId;
    const action = target.dataset.transactionAction;
    if (!id || (action !== "delete" && action !== "restore")) return;

    if (action === "delete") {
      const message =
        target.dataset.transactionTransfer === "true"
          ? "Delete this transfer? Both legs will be removed, since one alone would leave an account short."
          : "Delete this transaction?";
      if (!window.confirm(message)) return;
    }

    startTransition(async () => {
      setFeedback(null);
      const result =
        action === "delete"
          ? await withActionFeedback(
              () => deleteTransaction(id),
              "Reload Activity to check whether it was deleted.",
            )
          : await withActionFeedback(
              () => restoreTransaction(id),
              "Reload Activity to check whether it was restored.",
            );
      if (!result.ok) {
        setFeedback({ error: true, message: result.error });
        return;
      }
      setFeedback({
        error: false,
        message: action === "delete" ? "Transaction deleted." : "Transaction restored.",
      });
      router.refresh();
    });
  }

  return (
    <div aria-busy={pending} onClick={handleClick}>
      {children}
      {feedback ? (
        <p
          role={feedback.error ? "alert" : "status"}
          aria-live={feedback.error ? "assertive" : "polite"}
          className={
            feedback.error
              ? "feedback-enter mt-3 px-1 text-xs text-outflow"
              : "feedback-enter mt-3 px-1 text-xs text-ink-muted"
          }
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
