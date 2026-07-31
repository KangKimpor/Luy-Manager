import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function BudgetsPage() {
  return (
    <PhasePlaceholder title="Budgets" phase="Phase 2">
      <p>
        Budgets are scheduled for Phase 2 alongside the Telegram bot and reports.
      </p>
      <p>
        The groundwork is already in place: <code>spendingByCategory</code> produces
        the per-category totals a budget needs to compare against, and the
        <code> budgets</code> table is listed in the schema plan.
      </p>
    </PhasePlaceholder>
  );
}
