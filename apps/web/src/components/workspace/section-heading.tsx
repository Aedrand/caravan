import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared section heading for the workspace canvas (design v2.8 `.sec-head` —
 * the *baseline-rule* pattern). A 40px cream ink-bordered tile carrying a
 * Lucide glyph (stroke 2.25, `currentColor` — never emoji in chrome), the
 * section title as an `<h2>` in the display face, and an optional right-aligned
 * cluster of muted `meta` text + `actions`. The whole row sits on a full-width
 * 2px ink baseline underline — no filled header band, no eyebrow.
 *
 * The `<h2>` carries `id`/`tabIndex` so the section anchor is a focus target
 * after a scrollspy jump; the owning `<section>` sets `aria-labelledby`.
 */
export function SectionHeading({
  id,
  title,
  icon: Icon,
  meta,
  actions,
}: {
  /** The section id; the heading gets `${id}-h` to match `aria-labelledby`. */
  id: string;
  title: string;
  icon: LucideIcon;
  /** Right-aligned muted meta (e.g. "Oct 1 – 9 · 5 days"). */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 border-b-2 border-border pb-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-control border-2 border-border bg-card text-foreground shadow-control"
      >
        <Icon aria-hidden strokeWidth={2.25} className="size-5" />
      </span>
      <h2
        id={`${id}-h`}
        tabIndex={-1}
        className="font-display font-bold text-[27px] text-foreground leading-none tracking-tight outline-none"
      >
        {title}
      </h2>
      {(meta || actions) && (
        <div className="ml-auto flex items-center gap-3">
          {meta && (
            <span className="shrink-0 whitespace-nowrap font-display font-bold text-[12.5px] text-muted-foreground tracking-tight">
              {meta}
            </span>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
