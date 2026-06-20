import type { Activity } from "@caravan/shared";
import { ExternalLink, Map as MapIcon, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_META } from "./categories";
import { formatTimeRange, mapsSearchUrl } from "./format";

export function ActivityCard({
  activity,
  canEdit,
  onEdit,
  onDelete,
  dragHandle,
}: {
  activity: Activity;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  dragHandle?: ReactNode;
}) {
  const meta = CATEGORY_META[activity.category];
  const timeRange = formatTimeRange(activity.startTime, activity.endTime);
  const hasLinks = Boolean(activity.placeName) || Boolean(activity.linkUrl);

  return (
    <article className="cv-card flex gap-3 p-3 sm:p-4">
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
            <h4 className="font-display font-bold leading-snug">{activity.title}</h4>
            {timeRange && <p className="mt-0.5 text-sm text-muted-foreground">{timeRange}</p>}
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${activity.title}`}
                  className="-mr-1 shrink-0 text-muted-foreground"
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
      </div>
    </article>
  );
}
