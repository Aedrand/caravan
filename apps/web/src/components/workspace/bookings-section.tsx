import { type Activity, type ItemType, positionBetween, type TripSnapshot } from "@caravan/shared";
import {
  BedDouble,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Plane,
  Ticket,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ActivityFormDialog } from "@/components/itinerary/activity-form-dialog";
import { deriveDays, formatDayShort } from "@/components/itinerary/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIdeaLists, useTripMutation } from "@/lib/sync";
import { SectionHeading } from "./section-heading";

/**
 * Bookings section props (§6). The bookings come from `snapshot.activities`
 * filtered to flight/lodging — no new fetch. Exported so the shell can reference
 * the prop shape (it is imported by `trip-workspace.tsx`).
 */
export interface BookingsSectionProps {
  snapshot: TripSnapshot;
  canEdit: boolean;
}

/**
 * One bookings category (§6). The registry is the single extensible source of
 * truth: a third category (e.g. car rental) is one new entry here — its filter,
 * add affordance, empty line, and icon tint all flow from this config. Only
 * `flight`/`lodging` exist today (the `ItemType` discriminator from the shared
 * schema). `softVar` is the icon-chip background token, matching the established
 * flight/lodging tints in `rail-row`'s `SpineMark`.
 */
interface BookingCategoryConfig {
  id: string;
  label: string;
  /** Footer add-button label (mockup `.bk-foot button`). */
  addLabel: string;
  /** The `defaultType` passed to `ActivityFormDialog` in create mode. */
  addType: ItemType;
  Icon: LucideIcon;
  /** Icon-chip background CSS custom-property (soft category tint). */
  softVar: string;
  /** Quiet line shown to editors when the category has no bookings. */
  emptyLabel: string;
  filter: (a: Activity) => boolean;
}

const BOOKING_CATEGORIES: BookingCategoryConfig[] = [
  {
    id: "transport",
    label: "Transport",
    addLabel: "+ Flight",
    addType: "flight",
    Icon: Plane,
    softVar: "var(--cat-transport-soft)",
    emptyLabel: "No flights yet",
    filter: (a) => a.type === "flight",
  },
  {
    id: "lodging",
    label: "Lodging",
    addLabel: "+ Hotel",
    addType: "lodging",
    Icon: BedDouble,
    softVar: "var(--cat-lodging-soft)",
    emptyLabel: "No hotels yet",
    filter: (a) => a.type === "lodging",
  },
  // A third category (e.g. car rental) is one new entry here.
];

/** Mirrors `ItineraryBoard`'s create/edit dialog state. The Bookings ⋯ menu
 * offers Edit + Delete (§6), so only the create/edit variants are needed. */
type DialogState =
  | { mode: "create"; defaultDate: string | null; defaultType?: ItemType }
  | { mode: "edit"; activity: Activity }
  | null;

/**
 * The Bookings section (§6) — its own top-level workspace surface, above the
 * Itinerary, full-width (no map). Reads flight/lodging items straight off the
 * snapshot (no new fetch) and groups them by `BOOKING_CATEGORIES` into Transport
 * (flights) and Lodging (hotels). Each group renders a muted category sub-header,
 * a card of `BookingCard` rows, and a `canEdit`-gated add button that opens the
 * shared `ActivityFormDialog` in create mode with the category's `addType`.
 *
 * The `<section id="bookings">` anchor + heading ALWAYS render so the scrollspy
 * + IndexRail "Bookings" entry resolve even with zero bookings.
 */
export function BookingsSection({ snapshot, canEdit }: BookingsSectionProps) {
  const { trip, activities } = snapshot;
  const { mutateAsync } = useTripMutation();
  const { ideaLists } = useIdeaLists();
  const [dialog, setDialog] = useState<DialogState>(null);

  // Trip day buckets for the dialog's day selects (mirrors ItineraryBoard).
  const days = deriveDays(trip.startDate, trip.endDate, activities);

  // Append position within a day bucket (`null` = the Ideas pool). New bookings
  // from this section default to undated, so they land in the Ideas append slot.
  const appendPositionFor = (date: string | null): string => {
    const last = activities
      .filter((a) => a.date === date)
      .reduce<string | null>(
        (max, a) => (max === null || a.position > max ? a.position : max),
        null,
      );
    return positionBetween(last, null);
  };

  const openCreate = (type: ItemType) =>
    setDialog({ mode: "create", defaultDate: null, defaultType: type });
  const openEdit = (activity: Activity) => setDialog({ mode: "edit", activity });
  const remove = (activity: Activity) =>
    void mutateAsync("activity.delete", { activityId: activity.id }).catch(() => {});

  // Per category, the matching bookings off the snapshot.
  const groups = BOOKING_CATEGORIES.map((cat) => ({
    cat,
    items: activities.filter(cat.filter),
  }));
  // Viewers only see categories that have bookings; editors always see both
  // groups (so the add affordances are present). When the whole section is empty
  // for a viewer, a single muted line stands in (the anchor still renders).
  const visibleGroups = canEdit ? groups : groups.filter((g) => g.items.length > 0);
  const sectionEmptyForViewer = !canEdit && visibleGroups.length === 0;

  return (
    <section
      id="bookings"
      aria-labelledby="bookings-h"
      tabIndex={-1}
      className="scroll-mt-4 outline-none"
    >
      <SectionHeading id="bookings" title="Bookings" icon={Ticket} />

      {sectionEmptyForViewer ? (
        <p className="px-1 text-muted-foreground text-sm">No bookings yet</p>
      ) : (
        visibleGroups.map(({ cat, items }) => (
          <div key={cat.id}>
            {/* Category sub-header (mockup `.cat-head`): glyph + muted uppercase
                label + a trailing dotted rule, all from existing tokens. */}
            <div className="mt-4 mb-1 flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-5 items-center justify-center text-muted-foreground"
              >
                <cat.Icon strokeWidth={2.25} className="size-4" />
              </span>
              <span className="font-display font-bold text-muted-foreground text-xs uppercase tracking-[0.12em]">
                {cat.label}
              </span>
              <span
                aria-hidden
                className="ml-1 flex-1 self-center border-[var(--ink-faint)] border-t-2 border-dotted"
              />
            </div>

            <div className="cv-card overflow-hidden shadow-control">
              {items.length > 0 ? (
                <ul className="divide-y-2 divide-[var(--ink-faint)] divide-dotted">
                  {items.map((activity) => (
                    <li key={activity.id}>
                      <BookingCard
                        activity={activity}
                        icon={cat.Icon}
                        softVar={cat.softVar}
                        canEdit={canEdit}
                        onEdit={openEdit}
                        onDelete={remove}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-muted-foreground text-sm italic">{cat.emptyLabel}</p>
              )}
              {canEdit && (
                <div className="border-[var(--ink-faint)] border-t-2 border-dotted px-3 py-2">
                  <Button variant="secondary" size="sm" onClick={() => openCreate(cat.addType)}>
                    {cat.addLabel}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* Shared create/edit dialog — identical wiring to ItineraryBoard. New
          bookings from this section default to undated (defaultDate: null). */}
      <ActivityFormDialog
        open={dialog?.mode === "create" || dialog?.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        mode={dialog?.mode === "edit" ? "edit" : "create"}
        activity={dialog?.mode === "edit" ? dialog.activity : undefined}
        defaultDate={dialog?.mode === "create" ? dialog.defaultDate : undefined}
        defaultType={dialog?.mode === "create" ? dialog.defaultType : undefined}
        days={days}
        startDate={trip.startDate}
        currency={trip.currency}
        ideaLists={ideaLists}
        mutateAsync={mutateAsync}
        appendPositionFor={appendPositionFor}
      />
    </section>
  );
}

/** A booking row (mockup `.booking-row`): a category-tinted icon chip, the title,
 * an optional confirmation chip, the date range, and a ⋯ Edit/Delete menu. */
function BookingCard({
  activity,
  icon: Icon,
  softVar,
  canEdit,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  icon: LucideIcon;
  /** Icon-chip background token (the category's soft tint). */
  softVar: string;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}) {
  const range = bookingRange(activity.date, activity.endDate);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-control border-2 border-border text-foreground"
        style={{ backgroundColor: softVar }}
      >
        <Icon aria-hidden strokeWidth={2.25} className="size-4" />
      </span>
      <span
        className="min-w-0 truncate font-display font-bold text-foreground text-sm leading-snug"
        title={activity.title}
      >
        {activity.title}
      </span>
      {activity.confirmationCode && (
        <span className="shrink-0 rounded-pill border-2 border-border bg-[var(--paper-bright)] px-2 py-px font-body font-extrabold text-[10.5px] text-muted-foreground uppercase tracking-wide">
          #{activity.confirmationCode}
        </span>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap font-bold text-muted-foreground text-xs">
        {range}
      </span>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${activity.title}`}
              className="shrink-0 text-muted-foreground"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(activity)}>
              <Pencil aria-hidden />
              Edit details
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
  );
}

/** A booking's date range using the repo's compact day formatter (`formatDayShort`,
 * "Fri 2"). A same-day or missing `endDate` collapses to the single date; an
 * undated booking (parked in Ideas) reads "No date yet". */
function bookingRange(date: string | null, endDate: string | null): string {
  if (!date) return "No date yet";
  if (!endDate || endDate === date) return formatDayShort(date);
  return `${formatDayShort(date)} – ${formatDayShort(endDate)}`;
}
