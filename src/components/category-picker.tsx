"use client";

import { EntryChoicePicker } from "@/components/entry-choice-picker";
import { categoryGroup, quickCategories } from "@/lib/domain/entry-choices";
import type { Category } from "@/lib/domain/types";

export function CategoryPicker({ categories, selectedId, onSelect, label = "Category", compact = false }: {
  categories: readonly Category[]; selectedId: string | null; onSelect: (id: string | null) => void;
  label?: string; compact?: boolean;
}) {
  return <EntryChoicePicker label={label} collection="categories" allowClear selectedId={selectedId} onSelect={onSelect}
    quickIds={compact ? [] : quickCategories(categories, selectedId).map((category) => category.id)}
    options={categories.map((category) => ({ id: category.id, label: category.name, group: categoryGroup(category, categories),
      detail: categories.find((parent) => parent.id === category.parentId)?.name ?? categoryGroup(category, categories) }))} />;
}
