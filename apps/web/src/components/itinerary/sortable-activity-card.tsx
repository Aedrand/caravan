import type { Activity } from "@caravan/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { ActivityCard } from "./activity-card";

/** An ActivityCard made draggable via a dedicated grip handle (so links and the
 *  actions menu inside the card stay clickable). Editors only — viewers get the
 *  plain card. */
export function SortableActivityCard({
  activity,
  canEdit,
  onEdit,
  onDelete,
  editingBy,
  flash,
  footer,
  selected,
  onSelect,
}: {
  activity: Activity;
  canEdit: boolean;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  editingBy?: { name: string; color: string };
  flash?: boolean;
  footer?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
    disabled: !canEdit,
  });

  if (!canEdit) {
    return (
      <ActivityCard
        activity={activity}
        canEdit={canEdit}
        onEdit={onEdit}
        onDelete={onDelete}
        editingBy={editingBy}
        flash={flash}
        footer={footer}
        selected={selected}
        onSelect={onSelect}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40" : undefined}
    >
      <ActivityCard
        activity={activity}
        canEdit={canEdit}
        onEdit={onEdit}
        onDelete={onDelete}
        editingBy={editingBy}
        flash={flash}
        footer={footer}
        selected={selected}
        onSelect={onSelect}
        dragHandle={
          // Widened hit area (≥32px) for thumbs; the grip glyph stays size-4 so
          // the visual is unchanged. `title` gives sighted users the keyboard
          // hint; dnd-kit's KeyboardSensor already wires an aria-describedby with
          // full "space to pick up, arrows to move" instructions for screen
          // readers (via {...attributes}), so we don't re-describe it here.
          <button
            type="button"
            aria-label={`Reorder ${activity.title}`}
            title="Drag to reorder, or focus and use the arrow keys"
            className="-ml-2 flex w-8 cursor-grab touch-none items-center justify-center self-stretch rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        }
      />
    </div>
  );
}
