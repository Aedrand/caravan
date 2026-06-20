import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Rail color-theme switch — flips AXIS 2 (`data-theme` on <html>) between the
 * warm and dusk palettes and remembers the choice. Structure (AXIS 1,
 * `data-style`) is untouched, so the whole app re-inks without re-shaping. The
 * two-axis token contract (TD-11) is what makes this a ~handful of lines.
 */
const STORAGE_KEY = "caravan-theme";
const THEMES = ["warm", "dusk"] as const;
type ColorTheme = (typeof THEMES)[number];

function isTheme(value: string | null): value is ColorTheme {
  return value === "warm" || value === "dusk";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ColorTheme>(() => {
    if (typeof document === "undefined") return "warm";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
    const current = document.documentElement.getAttribute("data-theme");
    return isTheme(current) ? current : "warm";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // private mode / storage disabled — the in-memory choice still applies.
    }
  }, [theme]);

  const next: ColorTheme = theme === "warm" ? "dusk" : "warm";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={cn(
        "flex size-10 items-center justify-center rounded-full border bg-accent-soft text-foreground shadow-control transition-colors hover:bg-accent",
        className,
      )}
    >
      {theme === "warm" ? (
        <Sun aria-hidden className="size-5" />
      ) : (
        <Moon aria-hidden className="size-5" />
      )}
    </button>
  );
}
