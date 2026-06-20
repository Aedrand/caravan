import {
  ACTIVITY_CATEGORIES,
  type Activity,
  type ActivityCategory,
  createId,
  type MutationPayload,
  type MutationResponse,
  type MutationType,
} from "@caravan/shared";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_META } from "./categories";
import { dayNumber, formatDayLabel } from "./format";

type MutateAsync = <T extends MutationType>(
  type: T,
  payload: MutationPayload<T>,
) => Promise<MutationResponse>;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ActivityFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  activity?: Activity;
  defaultDate?: string | null;
  days: string[];
  startDate: string | null;
  mutateAsync: MutateAsync;
  appendPositionFor: (date: string | null) => string;
}) {
  const { open, onOpenChange, mode, activity } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add an activity" : "Edit activity"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Drop it on a day, or leave the date off to park it in Ideas."
              : "Update the details — everyone on the trip sees the change."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount per open so fields reset cleanly. */}
        <ActivityForm key={`${mode}:${activity?.id ?? "new"}`} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ActivityForm({
  onOpenChange,
  mode,
  activity,
  defaultDate,
  days,
  startDate,
  mutateAsync,
  appendPositionFor,
}: {
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  activity?: Activity;
  defaultDate?: string | null;
  days: string[];
  startDate: string | null;
  mutateAsync: MutateAsync;
  appendPositionFor: (date: string | null) => string;
}) {
  const [title, setTitle] = useState(activity?.title ?? "");
  const [dateValue, setDateValue] = useState(activity?.date ?? defaultDate ?? "");
  const [category, setCategory] = useState<ActivityCategory>(activity?.category ?? "other");
  const [startTime, setStartTime] = useState(activity?.startTime ?? "");
  const [endTime, setEndTime] = useState(activity?.endTime ?? "");
  const [location, setLocation] = useState(activity?.placeName ?? "");
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [linkUrl, setLinkUrl] = useState(activity?.linkUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Give it a name first.");
      return;
    }
    if (startTime && endTime && startTime > endTime) {
      setError("The end time is before the start time.");
      return;
    }
    const link = linkUrl.trim() || null;
    if (link && !/^https?:\/\//i.test(link)) {
      setError("Links need to start with http:// or https://");
      return;
    }

    const date = dateValue || null;
    const start = startTime || null;
    const end = endTime || null;
    const placeName = location.trim();
    const place = placeName ? { name: placeName } : null;

    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        await mutateAsync("activity.create", {
          activityId: createId(),
          title: trimmedTitle,
          date,
          position: appendPositionFor(date),
          category,
          startTime: start,
          endTime: end,
          notes,
          linkUrl: link,
          place,
        });
      } else if (activity) {
        const patch: MutationPayload<"activity.update">["patch"] = {};
        if (trimmedTitle !== activity.title) patch.title = trimmedTitle;
        if (category !== activity.category) patch.category = category;
        if (start !== activity.startTime) patch.startTime = start;
        if (end !== activity.endTime) patch.endTime = end;
        if (notes !== activity.notes) patch.notes = notes;
        if (link !== activity.linkUrl) patch.linkUrl = link;
        if ((place?.name ?? null) !== activity.placeName) patch.place = place;

        if (Object.keys(patch).length > 0) {
          await mutateAsync("activity.update", { activityId: activity.id, patch });
        }
        // date/position move only via activity.move (the LWW-resolved fields).
        if ((activity.date ?? "") !== dateValue) {
          await mutateAsync("activity.move", {
            activityId: activity.id,
            date,
            position: appendPositionFor(date),
          });
        }
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="activity-title">Title</Label>
        <Input
          id="activity-title"
          autoFocus
          value={title}
          maxLength={200}
          placeholder="Pastéis de Belém"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="activity-location">Location</Label>
        <Input
          id="activity-location"
          value={location}
          maxLength={200}
          placeholder="Where is it? (optional)"
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="activity-date">Day</Label>
          <select
            id="activity-date"
            className={SELECT_CLASS}
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          >
            <option value="">Ideas — no date yet</option>
            {days.map((iso) => {
              const n = dayNumber(iso, startDate);
              return (
                <option key={iso} value={iso}>
                  {n ? `Day ${n} · ${formatDayLabel(iso)}` : formatDayLabel(iso)}
                </option>
              );
            })}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activity-category">Category</Label>
          <select
            id="activity-category"
            className={SELECT_CLASS}
            value={category}
            onChange={(e) => setCategory(e.target.value as ActivityCategory)}
          >
            {ACTIVITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="activity-start">Starts</Label>
          <Input
            id="activity-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activity-end">Ends</Label>
          <Input
            id="activity-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="activity-link">Link</Label>
        <Input
          id="activity-link"
          type="url"
          value={linkUrl}
          maxLength={2048}
          placeholder="Booking or info link (optional)"
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="activity-notes">Notes</Label>
        <Textarea
          id="activity-notes"
          value={notes}
          maxLength={5000}
          placeholder="Anything the group should know"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Add to trip" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
