import { AddEntry } from "@/components/add-entry";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";
import { loadUsdKhrRate } from "@/lib/rates/repository";

/**
 * Entry point for adding an expense, income, or a transfer between accounts.
 *
 * The rate is loaded here rather than in the form because it is a server concern:
 * the daily sync writes it, and a transfer needs the figure in force now to
 * propose what will arrive in a differently denominated account.
 */
export default async function AddTransactionPage() {
  const { rate } = await loadUsdKhrRate();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Add</h1>
        <p className="text-ink-muted text-sm">Amount first, everything else optional.</p>
      </header>

      <AddEntry accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} rate={rate} />
    </div>
  );
}
