"use client";

import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2 } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteAccount, setAccountActive } from "@/app/actions/accounts";
import { withActionFeedback } from "@/lib/action-feedback";

/**
 * Per-account edit, close and delete inside a compact glass action popover.
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
      setError(null);
      const result = await withActionFeedback(
        () => setAccountActive(accountId, !isActive),
        "Reload Accounts to check the change.",
      );
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

    startTransition(async () => {
      setError(null);
      const result = await withActionFeedback(
        () => deleteAccount(accountId),
        "Reload Accounts to check whether it was deleted.",
      );
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <details className="relative shrink-0">
      <summary
        aria-label={`Actions for ${name}`}
        className="text-ink-faint hover:text-ink flex size-11 list-none items-center justify-center rounded-full"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </summary>
      <div className="glass absolute right-0 z-20 rounded-2xl p-1">
        <div aria-busy={pending} className="row-actions flex items-center gap-0.5">
          <Link
            href={`/accounts/${accountId}/edit`}
            aria-label={`Edit ${name}`}
            className="text-ink-faint hover:text-ink flex size-11 items-center justify-center"
          >
            <Pencil size={14} aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={toggleActive}
            disabled={pending}
            aria-label={isActive ? `Close ${name}` : `Reopen ${name}`}
            title={isActive ? "Close this account" : "Reopen this account"}
            className="text-ink-faint hover:text-ink flex size-11 items-center justify-center disabled:opacity-40"
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
              className="text-ink-faint hover:text-outflow flex size-11 items-center justify-center disabled:opacity-40"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          ) : null}

          {error ? (
            <span role="alert" className="feedback-enter text-outflow max-w-40 px-2 text-xs">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
