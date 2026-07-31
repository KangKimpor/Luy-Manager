import { AddEntry } from "@/components/add-entry";
import { Card, CardBody } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { isDemoMode } from "@/lib/auth";
import { listActiveAccountBalances } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/reference";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import Link from "next/link";

/**
 * Entry point for adding an expense, income, or a transfer between accounts.
 *
 * The rate is loaded here rather than in the form because it is a server concern:
 * the daily sync writes it, and both a transfer and a mixed-currency payment need
 * the figure in force now to say what something comes to.
 *
 * Only active accounts are offered. A closed account should not accept new entries,
 * and the server action refuses one anyway, so offering it would be a dead end.
 */
export default async function AddTransactionPage() {
  const [accounts, categories, { rate }] = await Promise.all([
    listActiveAccountBalances(),
    listCategories(),
    loadUsdKhrRate(),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-3 text-center">
            <p className="text-ink text-sm font-semibold">No accounts yet</p>
            <p className="text-ink-muted text-sm">
              A transaction has to come from somewhere. Add an account first.
            </p>
            <Link href="/accounts/new" className={buttonVariants({ size: "full" })}>
              Add an account
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-muted text-body-md">Amount first, everything else optional.</p>

      <AddEntry
        accounts={accounts}
        categories={categories}
        rate={rate}
        readOnly={isDemoMode()}
      />
    </div>
  );
}
