"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteAccount, setAccountActive } from "@/app/actions/accounts";

/**
 * Per-account edit, close and delete.
 *
 * Close is offered before delete, and delete is only offered for an account with no
 * history — `transactions.account_id` is `on delete restrict`, so the database would
 * refuse anyway, and "close it instead" is almost always what the user actually
 * wants. Closing keeps the balance and the history and stops the account counting
 * toward net worth.
 */
export function AccountRowActions({
  accountId,
  name,
  isActive,
  transactionCount,
}: {
  accountId: string;
  name: string;
  isActive: boolean;
  transactionCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    startTransition(async () => {
      const result = await setAccountActive(accountId, !isActive);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    // A delete that cannot be undone deserves a confirmation, and naming the
    // account makes it clear which one is about to go.
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

    startTransition(async () => {
      const result = await deleteAccount(accountId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-0.5">
      <Link
        href={`/accounts/${accountId}/edit`}
        aria-label={`Edit ${name}`}
        className="text-ink-faint hover:text-ink flex size-8 items-center justify-center"
      >
        <Pencil size={14} aria-hidden="true" />
      </Link>

      <button
        type="button"
        onClick={toggleActive}
        disabled={pending}
        aria-label={isActive ? `Close ${name}` : `Reopen ${name}`}
        title={isActive ? "Close this account" : "Reopen this account"}
        className="text-ink-faint hover:text-ink flex size-8 items-center justify-center disabled:opacity-40"
      >
        {isActive ? (
          <Archive size={14} aria-hidden="true" />
        ) : (
          <ArchiveRestore size={14} aria-hidden="true" />
        )}
      </button>

      {transactionCount === 0 ? (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Delete ${name}`}
          className="text-ink-faint hover:text-outflow flex size-8 items-center justify-center disabled:opacity-40"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}

      {error ? (
        <span role="alert" className="text-outflow max-w-40 text-xs">
          {error}
        </span>
      ) : null}
    </div>
  );
}
