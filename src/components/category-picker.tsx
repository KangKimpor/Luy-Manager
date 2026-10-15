"use client";

import { EntryChoicePicker } from "@/components/entry-choice-picker";
import { quickCategories } from "@/lib/domain/entry-choices";
import type { Category } from "@/lib/domain/types";
import { categoryIconKey, categoryKeywords, categoryLabel, groupedCategories } from "@/lib/domain/categories";

export function CategoryPicker({ categories, selectedId, onSelect, label = "Category", compact = false, emptyLabel, clearLabel }: {
  categories: readonly Category[]; selectedId: string | null; onSelect: (id: string | null) => void;
  label?: string; compact?: boolean;
  emptyLabel?: string; clearLabel?: string;
}) {
  return <EntryChoicePicker label={label} collection="categories" allowClear selectedId={selectedId} onSelect={onSelect}
    emptyLabel={emptyLabel} clearLabel={clearLabel}
    quickIds={compact ? [] : quickCategories(categories, selectedId).map((category) => category.id)}
    options={groupedCategories(categories).flatMap((group) => group.categories.map((category) => ({
      id: category.id, label: categoryLabel(category), group: group.name, icon: categoryIconKey(category), keywords: categoryKeywords(category),
    })))} />;
}
