"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { createBudget } from "@/app/actions/budgets";
import { BUDGET_PERIODS, type BudgetPeriod, type Category } from "@/lib/domain/types";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Creating a budget.
 *
 * The currency is chosen, not inherited from the reporting preference, because
 * someone who thinks of transport as "400,000៛ a month" wants to see that figure
 * rather than its dollar equivalent drifting with the rate. Spending gets converted
 * to meet it, which is the side that already carries a recorded rate.
 *
 * The start date is the anchor the period repeats from, which is why it is offered
 * rather than assumed: a monthly budget starting on the 15th runs 15th to 14th.
 */
export function BudgetForm({
  categories,
  defaultCurrency,
}: {
  categories: readonly Category[];
  defaultCurrency: CurrencyCode;
}) {
  const router = useRouter();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [rollover, setRollover] = useState(false);
  const [threshold, setThreshold] = useState(80);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only categories that can carry spending; a budget on an income category would
  // never be spent against.
  const spendingCategories = categories.filter((category) =>
    category.appliesTo.includes("expense"),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await createBudget({
      categoryId,
      amount: amount.trim(),
      currency,
      period,
      startsOn,
      rollover,
      alertThreshold: threshold / 100,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/budgets");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Card>
        <CardBody className="space-y-3 pt-4">
          <div>
            <label
              htmlFor="budget-category"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Category
            </label>
            <select
              id="budget-category"
              value={categoryId ?? ""}
              onChange={(event) => setCategoryId(event.target.value || null)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            >
              <option value="">Everything (one overall cap)</option>
              {spendingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="budget-amount"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                id="budget-amount"
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={currency === "KHR" ? "400000" : "150.00"}
                className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 flex-1 border px-3 text-sm"
              />
              <div className="flex gap-1" role="group" aria-label="Budget currency">
                {CURRENCIES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={currency === code}
                    onClick={() => {
                      setCurrency(code);
                      // Riel has no subunit.
                      if (code === "KHR") setAmount((v) => v.split(".")[0]);
                    }}
                    className={cn(
                      "rounded-pill min-h-9 px-3 text-xs font-bold transition-colors",
                      currency === code
                        ? "bg-brand text-white"
                        : "bg-surface-muted text-ink-muted",
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              Repeats
            </legend>
            <div className="flex flex-wrap gap-2">
              {BUDGET_PERIODS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={period === option}
                  onClick={() => setPeriod(option)}
                  className={cn(
                    "rounded-pill min-h-9 border px-3 text-xs font-medium capitalize transition-colors",
                    period === option
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border-subtle bg-surface text-ink-muted",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="budget-start"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Starting
            </label>
            <input
              id="budget-start"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            />
            <p className="text-ink-faint mt-1.5 text-xs">
              The period repeats from this day. A monthly budget starting on the 15th
              runs the 15th to the 14th.
            </p>
          </div>

          <div>
            <label
              htmlFor="budget-threshold"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Warn at {threshold}%
            </label>
            <input
              id="budget-threshold"
              type="range"
              min={50}
              max={100}
              step={5}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              className="w-full"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={rollover}
              onChange={(event) => setRollover(event.target.checked)}
              className="size-4"
            />
            <span className="text-ink">Carry anything unspent into the next period</span>
          </label>
        </CardBody>
      </Card>

      {error ? (
        <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button size="full" type="submit" disabled={pending || amount.trim() === ""}>
        <Check size={18} aria-hidden="true" />
        {pending ? "Saving…" : "Add budget"}
      </Button>
    </form>
  );
}
