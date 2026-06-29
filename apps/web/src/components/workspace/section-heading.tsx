import type { ReactNode } from "react";

/**
 * Shared section heading for the V2.7 workspace canvas (§4 mockup `.sec-head`):
 * a glyph badge, the section title as an `<h2>` carrying `id`/`tabIndex` (so the
 * section anchor is a focus target after a scrollspy jump), and an optional
 * right-aligned action cluster. The owning `<section>` sets `id` + `aria-labelledby`.
 */
export function SectionHeading({
  id,
  title,
  glyph,
  actions,
}: {
  /** The section id; the heading gets `${id}-h` to match `aria-labelledby`. */
  id: string;
  title: string;
  glyph: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control border-2 border-border bg-card text-lg shadow-control"
      >
        {glyph}
      </span>
      <h2
        id={`${id}-h`}
        tabIndex={-1}
        className="font-display font-bold text-2xl text-foreground outline-none"
      >
        {title}
      </h2>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
