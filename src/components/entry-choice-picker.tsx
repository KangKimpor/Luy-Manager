"use client";

import { Check, ChevronDown, Search } from "@/components/app-icon";
import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/category-icon";

export interface EntryChoice {
  id: string;
  label: string;
  detail?: string;
  group: string;
  keywords?: string;
  icon?: string;
}

/** Quick choices stay one tap away; search reaches every item without scrolling. */
export function EntryChoicePicker({ label, collection, options, quickIds, selectedId, onSelect, allowClear = false, emptyLabel, clearLabel = "Clear category" }: {
  label: string; collection: "categories" | "accounts"; options: readonly EntryChoice[]; quickIds: readonly string[];
  selectedId: string | null; onSelect: (id: string | null) => void; allowClear?: boolean;
  emptyLabel?: string; clearLabel?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const selected = options.find((option) => option.id === selectedId);
  const groups = useMemo(() => [...new Set(options.map((option) => option.group))], [options]);
  const quick = quickIds.map((quickId) => options.find((option) => option.id === quickId)).filter((option) => option !== undefined);
  const shown = open ? options.filter((option) => {
    const matches = `${option.label} ${option.detail ?? ""} ${option.group} ${option.keywords ?? ""}`.toLocaleLowerCase();
    // Search spans all groups, even after a group chip was selected.
    return query.trim() ? query.trim().toLocaleLowerCase().split(/\s+/).every((word) => matches.includes(word)) : !group || option.group === group;
  }) : quick;

  function choose(nextId: string | null) {
    onSelect(nextId);
    setOpen(false);
    setQuery("");
    setGroup(null);
    trigger.current?.focus();
  }

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-ink-muted mb-2 text-sm font-medium">{label}</legend>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p key={selectedId} className="selection-label text-ink flex min-w-0 items-center gap-2 break-words text-sm font-semibold">
          {selected?.icon ? <CategoryIcon icon={selected.icon} /> : null}
          <span>
          {selected?.label ?? emptyLabel ?? (allowClear ? "Uncategorised" : "Choose an account")}
          {selected?.detail ? <span className="text-ink-faint ml-2 text-xs font-normal">{selected.detail}</span> : null}
          </span>
        </p>
        <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="text-brand flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold">
          {open ? "Done" : `All ${collection}`}
          <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div id={id} className="panel-enter border-border-subtle bg-surface-container space-y-3 rounded-2xl border p-3">
          <div className="relative">
            <Search size={16} className="text-ink-faint pointer-events-none absolute top-3.5 left-3" aria-hidden="true" />
            <input type="search" aria-label={`Search ${collection}`} placeholder={`Search ${collection}`}
              value={query} onChange={(event) => setQuery(event.target.value)}
              className="border-border-subtle bg-surface text-ink placeholder:text-ink-faint min-h-11 w-full rounded-xl border py-2 pr-3 pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filter ${collection}`}>
            {[null, ...groups].map((name) => (
              <button key={name ?? "all"} type="button" aria-pressed={group === name} onClick={() => { setGroup(name); setQuery(""); }}
                className={cn("min-h-11 rounded-xl px-3 text-xs font-medium transition-colors", group === name ? "bg-brand text-on-action" : "bg-surface text-ink-muted")}>
                {name ?? "All"}
              </button>
            ))}
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto overscroll-contain">
            {shown.map((option) => choice(option))}
          </div>
          {shown.length === 0 ? <p role="status" className="text-ink-muted py-3 text-center text-sm">No matches. Try a name or another group.</p> : null}
        </div>
      ) : <div className="grid grid-cols-2 gap-2">{shown.map((option) => choice(option))}</div>}
      {allowClear && selectedId ? <button type="button" onClick={() => choose(null)} className="text-ink-muted min-h-11 rounded-lg px-2 text-xs">{clearLabel}</button> : null}
    </fieldset>
  );

  function choice(option: EntryChoice) {
    const active = option.id === selectedId;
    return (
      <button key={option.id} type="button" aria-label={option.label} aria-pressed={active} onClick={() => choose(option.id)}
        className={cn("flex min-h-14 min-w-0 items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors", active ? "border-brand bg-brand-soft text-brand" : "border-border-subtle bg-surface text-ink-muted")}>
        {option.icon ? <CategoryIcon icon={option.icon} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium">{option.label}</span>
          {option.detail ? <span className="text-ink-faint mt-0.5 block break-words text-xs">{option.detail}</span> : null}
        </span>
        {active ? <Check size={15} className="selection-check shrink-0" aria-hidden="true" /> : null}
      </button>
    );
  }
}
