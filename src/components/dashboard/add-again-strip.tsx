import { AppLink as Link } from "@/components/app-link";
import { CategoryIcon, categoryColorToken } from "@/components/category-icon";
import { MoneyAmount } from "@/components/money-amount";
import { entryHabitKey, type EntryHabit } from "@/lib/domain/entry-habits";
import type { Category } from "@/lib/domain/types";

export function AddAgainStrip({
  habits,
  categories,
  limit = 5,
}: {
  habits: readonly EntryHabit[];
  categories: Record<string, Category>;
  limit?: number;
}) {
  const shown = habits.slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <section className="sec-wrap order-2 lg:order-none" aria-label="Add again">
      <div className="sec-head">
        <h2 className="sec-title">Add again</h2>
      </div>
      <div className="chip-scroll">
        {shown.map((habit) => {
          const category = categories[habit.categoryId];
          const color = categoryColorToken(category);
          const key = entryHabitKey(habit);

          return (
            <Link
              key={key}
              href={`/add?habit=${encodeURIComponent(key)}`}
              className="add-again-chip"
            >
              <span
                aria-hidden="true"
                className="add-again-icon"
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} 16%, var(--color-surface))`,
                  color,
                }}
              >
                <CategoryIcon category={category} size={17} />
              </span>
              <span className="add-again-text">
                <span className="add-again-note">{habit.note}</span>
                <span className="add-again-amt">
                  <MoneyAmount amount={habit.amount} />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
