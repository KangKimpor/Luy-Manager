import { setTheme } from "@/app/actions/theme";
import { THEMES, type Theme } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

export function ThemeToggle({ current }: { current: Theme }) {
  return <form action={setTheme} aria-label="Appearance" className="grid grid-cols-3 gap-2">
    {THEMES.map(theme => <button key={theme} name="theme" value={theme} aria-pressed={current === theme}
      className={cn("min-h-11 rounded-2xl px-3 text-sm font-semibold capitalize", current === theme ? "bg-brand-soft text-brand" : "bg-surface-muted text-ink-muted")}>
      {theme}
    </button>)}
  </form>;
}
