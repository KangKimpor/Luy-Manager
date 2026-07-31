import { BudgetForm } from "@/components/budget-form";
import { requireUser } from "@/lib/auth";
import { listCategories } from "@/lib/data/reference";
import { getProfile } from "@/lib/data/reference";

export default async function NewBudgetPage() {
  await requireUser();

  const [categories, profile] = await Promise.all([listCategories(), getProfile()]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Add a budget</h1>
        <p className="text-ink-muted text-sm">
          A limit on one category, or one cap on everything.
        </p>
      </header>

      <BudgetForm
        categories={categories}
        defaultCurrency={profile?.baseCurrency ?? "USD"}
      />
    </div>
  );
}
