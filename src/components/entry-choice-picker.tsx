"use client";

import { Check, ChevronDown, Search, X } from "@/components/app-icon";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MoneyAmount } from "@/components/money-amount";
import type { Money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/category-icon";

export interface EntryChoice {
  id: string;
  label: string;
  detail?: string;
  balance?: Money;
  group: string;
  keywords?: string;
  icon?: string;
}

/** Quick choices stay one tap away; search reaches every item without scrolling. */
export function EntryChoicePicker({ label, collection, options, quickIds, selectedId, onSelect, allowClear = false, emptyLabel, clearLabel = "Clear category", compact = false, showQuickChoices = false }: {
  label: string; collection: "categories" | "accounts"; options: readonly EntryChoice[]; quickIds: readonly string[];
  selectedId: string | null; onSelect: (id: string | null) => void; allowClear?: boolean;
  emptyLabel?: string; clearLabel?: string; compact?: boolean; showQuickChoices?: boolean;
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
      <div className={cn("flex min-w-0 items-start justify-between gap-2", compact && "bg-fill rounded-control items-center px-3")}>
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
        <div id={id} className="panel-enter bg-surface border-card-edge space-y-3 rounded-card border-[0.5px] p-3">
          <div className="relative">
            <Search size={16} className="text-ink-faint pointer-events-none absolute top-3.5 left-3" aria-hidden="true" />
            <input type="search" aria-label={`Search ${collection}`} placeholder={`Search ${collection}`}
              value={query} onChange={(event) => setQuery(event.target.value)}
              className="field-input py-2 pr-3 pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filter ${collection}`}>
            {[null, ...groups].map((name) => (
              <button key={name ?? "all"} type="button" aria-pressed={group === name} onClick={() => { setGroup(name); setQuery(""); }}
                className={cn("rounded-pill min-h-11 px-3.5 text-xs font-medium transition-colors", group === name ? "bg-brand text-on-action" : "bg-fill text-ink-muted")}>
                {name ?? "All"}
              </button>
            ))}
          </div>
          <div className={cn(collection === "categories" ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2", "max-h-72 overflow-y-auto overscroll-contain")}>
            {shown.map((option) => choice(option))}
          </div>
          {shown.length === 0 ? <p role="status" className="text-ink-muted py-3 text-center text-sm">No matches. Try a name or another group.</p> : null}
        </div>
      ) : !compact || showQuickChoices ? (
        <div className={cn(collection === "categories" ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2")}>
          {shown.map((option) => choice(option))}
        </div>
      ) : null}
      {allowClear && selectedId ? <button type="button" onClick={() => choose(null)} className="text-ink-muted min-h-11 rounded-lg px-2 text-xs">{clearLabel}</button> : null}
    </fieldset>
  );

  function choice(option: EntryChoice) {
    const active = option.id === selectedId;
    if (collection === "categories") {
      return (
        <button key={option.id} type="button" aria-label={option.label} aria-pressed={active} onClick={() => choose(option.id)}
          className="cat-chip">
          {option.icon ? <CategoryIcon icon={option.icon} size={15} /> : null}
          <span>{option.label}</span>
          {active ? <Check size={14} className="selection-check shrink-0" aria-hidden="true" /> : null}
        </button>
      );
    }

    return (
      <button key={option.id} type="button" aria-label={option.label} aria-pressed={active} onClick={() => choose(option.id)}
        className="acct-chip w-full text-left">
        <span className="flex w-full items-center justify-between gap-1.5">
          <span className="text-ink truncate text-[13px] font-semibold leading-[18px]">{option.label}</span>
          {active ? <Check size={14} className="selection-check text-brand shrink-0" aria-hidden="true" /> : null}
        </span>
        {option.detail ? <span className="text-ink-faint text-xs">{option.detail}</span> : null}
      </button>
    );
  }
}

/** Single-row horizontal chip selector paired with a native <dialog> bottom sheet picker. */
export function HorizontalChoiceRow({
  label,
  collection,
  rowOptions,
  dialogOptions,
  selectedId,
  disabledIds,
  onSelect,
  allowClear = false,
  clearLabel = "Clear category",
  leadingCaption,
  triggerText,
  triggerLabel,
  searchLabel,
}: {
  label: string;
  collection: "categories" | "accounts";
  rowOptions: readonly EntryChoice[];
  dialogOptions?: readonly EntryChoice[];
  selectedId: string | null;
  disabledIds?: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  allowClear?: boolean;
  clearLabel?: string;
  leadingCaption?: string;
  triggerText: string;
  triggerLabel: string;
  searchLabel?: string;
}) {
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const prevSelectedRef = useRef<string | null>(selectedId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const allOptions = dialogOptions ?? rowOptions;
  const groups = useMemo(() => [...new Set(allOptions.map((option) => option.group))], [allOptions]);

  const filtered = useMemo(() => {
    if (!open) return [];
    const trimmed = query.trim().toLocaleLowerCase();
    const words = trimmed ? trimmed.split(/\s+/) : [];
    return allOptions.filter((option) => {
      if (words.length > 0) {
        const matches = `${option.label} ${option.detail ?? ""} ${option.group} ${option.keywords ?? ""}`.toLocaleLowerCase();
        return words.every((word) => matches.includes(word));
      }
      return !group || option.group === group;
    });
  }, [open, allOptions, query, group]);

  useEffect(() => {
    if (prevSelectedRef.current === selectedId) return;
    prevSelectedRef.current = selectedId;
    if (!selectedId) return;
    const target = itemRefs.current.get(selectedId);
    target?.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      dialog.focus();
    } else {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setQuery("");
    setGroup(null);
    const dialog = dialogRef.current;
    if (dialog) {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
    triggerRef.current?.focus();
  }

  function handleSelect(nextId: string | null) {
    onSelect(nextId);
    if (open) {
      closeDialog();
    }
  }

  return (
    <div className="min-w-0">
      <div className="chip-scroll add-chip-row" role="group" aria-label={label}>
        {leadingCaption ? (
          <span className="add-row-caption">{leadingCaption}</span>
        ) : null}

        {rowOptions.map((option) => {
          const active = option.id === selectedId;
          const disabled = disabledIds?.has(option.id) ?? false;

          if (collection === "categories") {
            return (
              <button
                key={option.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(option.id, el);
                  else itemRefs.current.delete(option.id);
                }}
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => handleSelect(active && allowClear ? null : option.id)}
                className="cat-chip"
              >
                {option.icon ? <CategoryIcon icon={option.icon} size={15} /> : null}
                <span>{option.label}</span>
              </button>
            );
          }

          return (
            <button
              key={option.id}
              ref={(el) => {
                if (el) itemRefs.current.set(option.id, el);
                else itemRefs.current.delete(option.id);
              }}
              type="button"
              aria-label={option.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => handleSelect(option.id)}
              className="acct-chip add-acct-chip text-left disabled:opacity-35"
            >
              <span className="text-ink block max-w-[140px] truncate text-[13px] font-semibold leading-[16px]">
                {option.label}
              </span>
              {option.balance ? (
                <MoneyAmount
                  amount={option.balance}
                  className={cn(
                    "block text-[11px] leading-[14px]",
                    active ? "text-brand" : "text-ink-muted",
                  )}
                />
              ) : option.detail ? (
                <span className="text-ink-muted block text-[11px] leading-[14px]">{option.detail}</span>
              ) : null}
            </button>
          );
        })}

        <button
          ref={triggerRef}
          type="button"
          aria-label={triggerLabel}
          onClick={() => setOpen(true)}
          className={cn(
            collection === "categories" ? "cat-chip" : "acct-chip add-acct-chip add-row-more-chip",
            "text-brand font-semibold",
          )}
        >
          {collection === "categories" ? <Search size={14} aria-hidden="true" /> : null}
          <span>{triggerText}</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className="picker-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeDialog();
          }
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
      >
        {open ? (
          <div className="picker-dialog-panel">
            <div className="flex items-center justify-between gap-2">
              <h2 id={headingId} className="text-ink text-[17px] leading-[22px] font-semibold tracking-[-0.025em]">
                {label}
              </h2>
              <div className="flex items-center gap-1">
                {allowClear && selectedId ? (
                  <button
                    type="button"
                    onClick={() => handleSelect(null)}
                    className="text-brand rounded-pill min-h-11 px-3 text-xs font-semibold"
                  >
                    {clearLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeDialog}
                  aria-label="Close"
                  className="bg-fill text-ink-muted hover:text-ink flex size-11 items-center justify-center rounded-full"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="text-ink-faint pointer-events-none absolute top-3.5 left-3.5" aria-hidden="true" />
              <input
                type="search"
                aria-label={searchLabel ?? `Search ${collection}`}
                placeholder={searchLabel ?? `Search ${collection}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="search-input"
              />
            </div>

            {groups.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filter ${collection}`}>
                {[null, ...groups].map((name) => (
                  <button
                    key={name ?? "all"}
                    type="button"
                    aria-pressed={group === name}
                    onClick={() => {
                      setGroup(name);
                      setQuery("");
                    }}
                    className={cn(
                      "rounded-pill min-h-9 px-3.5 text-xs font-medium transition-colors",
                      group === name ? "bg-brand text-on-action" : "bg-fill text-ink-muted",
                    )}
                  >
                    {name ?? "All"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="picker-dialog-list">
              <div className={cn(collection === "categories" ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2")}>
                {filtered.map((option) => {
                  const active = option.id === selectedId;
                  const disabled = disabledIds?.has(option.id) ?? false;
                  if (collection === "categories") {
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => handleSelect(option.id)}
                        className="cat-chip"
                      >
                        {option.icon ? <CategoryIcon icon={option.icon} size={15} /> : null}
                        <span>{option.label}</span>
                        {active ? <Check size={14} className="selection-check shrink-0" aria-hidden="true" /> : null}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={active}
                      disabled={disabled}
                      onClick={() => handleSelect(option.id)}
                      className="acct-chip add-acct-chip w-full text-left disabled:opacity-35"
                    >
                      <span className="flex w-full items-center justify-between gap-1.5">
                        <span className="text-ink truncate text-[13px] font-semibold leading-[16px]">
                          {option.label}
                        </span>
                        {active ? <Check size={14} className="selection-check text-brand shrink-0" aria-hidden="true" /> : null}
                      </span>
                      {option.balance ? (
                        <MoneyAmount amount={option.balance} className="text-ink-muted block text-[11px] leading-[14px]" />
                      ) : option.detail ? (
                        <span className="text-ink-faint text-xs">{option.detail}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0 ? (
                <p role="status" className="text-ink-muted py-4 text-center text-sm">
                  No matches. Try a name or another group.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
