import { QuickAddForm } from "@/components/quick-add-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";

export default function AddTransactionPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Add</h1>
        <p className="text-ink-muted text-sm">Amount first, everything else optional.</p>
      </header>

      <QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} />
    </div>
  );
}
