import type { Activity, ChecklistItem } from "@caravan/shared";
import { ListChecks, MoreHorizontal, Pencil, StickyNote, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ActivityCard } from "@/components/itinerary/activity-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Per-type glyph + tint for the freeform idea kinds (D1). Activity ideas reuse
 *  the category glyph via ActivityCard; only note/checklist need their own. */
const FREEFORM_GLYPH = {
  note: { Icon: StickyNote, soft: "var(--info-soft)", color: "var(--info)" },
  checklist: { Icon: ListChecks, soft: "var(--success-soft)", color: "var(--success)" },
} as const;

/**
 * One idea card, branching on the D1 `type` discriminator (Trip Workspace v2).
 *
 * - `activity` ideas reuse the itinerary's `ActivityCard` wholesale (title,
 *   place, body, link-outs + the shared vote/comment footer) — zero drift.
 * - `note` / `checklist` ideas render here with their own glyph + body but the
 *   same `cv-card` shell and `footer` slot, so freeform ideas read as siblings
 *   of activity ideas inside a list.
 *
 * Votes/comments come in through `footer` (an `ActivityFooter`), identical for
 * every type — the discriminator only swaps the glyph + body.
 */
export function IdeaCard({
  activity,
  canEdit,
  onEdit,
  onDelete,
  onToggleChecklistItem,
  footer,
}: {
  activity: Activity;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  /** Check/uncheck one checklist entry (D1 `checklist.toggle`). Unused for
   *  non-checklist ideas. */
  onToggleChecklistItem: (activity: Activity, item: ChecklistItem, done: boolean) => void;
  footer?: ReactNode;
}) {
  // Activity ideas are exactly today's card — full reuse keeps them in lockstep.
  if (activity.type === "activity") {
    return (
      <ActivityCard
        activity={activity}
        canEdit={canEdit}
        onEdit={onEdit}
        onDelete={onDelete}
        footer={footer}
      />
    );
  }

  const isChecklist = activity.type === "checklist";
  const glyph = isChecklist ? FREEFORM_GLYPH.checklist : FREEFORM_GLYPH.note;
  const items = activity.checklistItems ?? [];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <article className="cv-card flex gap-3 p-3 sm:p-4">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control"
        style={{ backgroundColor: glyph.soft, color: glyph.color }}
      >
        <glyph.Icon className="size-[18px]" strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-display font-bold leading-snug">{activity.title}</h4>
            {isChecklist && items.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {doneCount}/{items.length} done
              </p>
            )}
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${activity.title}`}
                  className="-mr-1.5 shrink-0 text-muted-foreground"
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(activity)}>
                  <Pencil aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(activity)}>
                  <Trash2 aria-hidden />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Note body — quote-styled, full text (no map/links on a note). */}
        {activity.type === "note" &&
          (activity.notes ? (
            <p className="mt-2 whitespace-pre-wrap border-border border-l-2 pl-3 text-sm italic leading-relaxed text-foreground/80">
              {activity.notes}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">No note yet.</p>
          ))}

        {/* Checklist — real checkboxes; concurrent-safe per-item toggle. */}
        {isChecklist &&
          (items.length === 0 ? (
            <p className="mt-2 text-sm italic text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canEdit}
                    aria-label={item.text}
                    style={{ accentColor: "var(--color-primary)" }}
                    className="mt-0.5 size-4 shrink-0"
                    onChange={(e) => onToggleChecklistItem(activity, item, e.target.checked)}
                  />
                  <span className={cn(item.done && "text-muted-foreground line-through")}>
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {footer}
      </div>
    </article>
  );
}
