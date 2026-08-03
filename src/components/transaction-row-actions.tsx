"use client";

import { Pencil, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTransaction, restoreTransaction } from "@/app/actions/transactions";

/**
 * The only interactive part of a ledger row.
 *
 * Keeping mutation controls behind this client boundary means dashboard rows are
 * entirely server-rendered, and the ledger does not hydrate formatting, icons or
 * transfer-label logic for every transaction.
 */
export function TransactionRowActions({
  transactionId,
  isTransfer,
  deleted,
}: {
  transactionId: string;
  isTransfer: boolean;
  deleted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    const message = isTransfer
      ? "Delete this transfer? Both legs will be removed, since one alone would leave an account short."
      : "Delete this transaction?";
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await deleteTransaction(transactionId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await restoreTransaction(transactionId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className={pending ? "flex shrink-0 items-center gap-0.5 opacity-50" : "flex shrink-0 items-center gap-0.5"}>
      {deleted ? (
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          aria-label="Restore this transaction"
          className="text-ink-faint hover:text-inflow flex size-8 items-center justify-center disabled:opacity-40"
        >
          <Undo2 size={14} aria-hidden="true" />
        </button>
      ) : (
        <>
          {isTransfer ? null : (
            <Link
              href={`/transactions/${transactionId}/edit`}
              aria-label="Edit this transaction"
              className="text-ink-faint hover:text-ink flex size-8 items-center justify-center"
            >
              <Pencil size={14} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Delete this transaction"
            className="text-ink-faint hover:text-outflow flex size-8 items-center justify-center disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </>
      )}
      {error ? <span role="alert" className="text-outflow max-w-32 text-xs">{error}</span> : null}
    </div>
  );
}
