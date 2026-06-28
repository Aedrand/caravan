import type { Activity } from "@caravan/shared";
import { ExternalLink, Map as MapIcon, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { isPlotted } from "@/components/map/geo-features";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "./categories";
import { formatTimeRange, mapsSearchUrl } from "./format";

export function ActivityCard({
  activity,
  canEdit,
  onEdit,
  onDelete,
  dragHandle,
  editingBy,
  flash,
  footer,
  selected = false,
  onSelect,
}: {
  activity: Activity;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  dragHandle?: ReactNode;
  /** A live hint that another member is editing this card right now (PD-5). */
  editingBy?: { name: string; color: string };
  /** Briefly true right after a remote change lands, to draw the eye (PD-5). */
  flash?: boolean;
  /** Track A: votes + comments rail rendered under the card body (PD-2/PD-4). */
  footer?: ReactNode;
  /** This card is the highlighted one on the ambient map (Track C selection). */
  selected?: boolean;
  /** Toggle this activity's pin on the map. Only meaningful when it's plotted. */
  onSelect?: () => void;
}) {
  const meta = CATEGORY_META[activity.category];
  const timeRange = formatTimeRange(activity.startTime, activity.endTime);
  const hasLinks = Boolean(activity.placeName) || Boolean(activity.linkUrl);
  // The title doubles as the "show on map" trigger — but only when there's a pin
  // to fly to. Unplotted activities keep a plain (non-interactive) title.
  const selectable = Boolean(onSelect) && isPlotted(activity);

  return (
    <article
      className={cn(
        "cv-card flex gap-3 p-3 transition-[outline-color] duration-500 sm:p-4",
        flash && "outline outline-2 outline-offset-2",
        selected && "ring-2 ring-[var(--accent-strong)]",
      )}
      style={flash ? { outlineColor: "var(--accent-strong)" } : undefined}
    >
      {dragHandle}
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control"
        style={{ backgroundColor: meta.soft, color: meta.color }}
      >
        <meta.Icon className="size-[18px]" strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-display font-bold leading-snug">
              {selectable ? (
                <button
                  type="button"
                  onClick={onSelect}
                  aria-pressed={selected}
                  title={selected ? "Hide on map" : "Show on map"}
                  className="rounded-sm text-left outline-none transition-colors hover:text-[var(--accent-strong)] focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {activity.title}
                </button>
              ) : (
                activity.title
              )}
            </h4>
            {timeRange && <p className="mt-0.5 text-sm text-muted-foreground">{timeRange}</p>}
            {editingBy && (
              <p
                className="mt-1 flex items-center gap-1 text-xs font-semibold"
                style={{ color: editingBy.color }}
              >
                <span aria-hidden>✦</span>
                {editingBy.name} is editing…
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

        {activity.placeName && (
          <p className="mt-1 truncate text-sm text-muted-foreground" title={activity.placeName}>
            {activity.placeName}
          </p>
        )}

        {activity.notes && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/80">
            {activity.notes}
          </p>
        )}

        {hasLinks && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activity.placeName && (
              <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                <a
                  href={mapsSearchUrl(activity.placeName, activity.address)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <MapIcon aria-hidden />
                  Map
                </a>
              </Button>
            )}
            {activity.linkUrl && (
              <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                <a href={activity.linkUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink aria-hidden />
                  Open link
                </a>
              </Button>
            )}
          </div>
        )}

        {footer}
      </div>
    </article>
  );
}
