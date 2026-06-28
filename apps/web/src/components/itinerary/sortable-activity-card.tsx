import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { RailRow, type RailRowProps } from "./rail-row";

/**
 * A progression-rail row (RailRow) made draggable via a dedicated grip handle,
 * so the title's map-select trigger, the foot counts, and the actions menu stay
 * clickable. Editors only — viewers get the plain row. Reorder = resequence:
 * dropping renumbers the stamps live (the numbers are recomputed from order).
 */
export function SortableRailRow(props: RailRowProps) {
  const { activity, canEdit } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
    disabled: !canEdit,
  });

  if (!canEdit) {
    return <RailRow {...props} />;
  }

  return (
    <RailRow
      {...props}
      innerRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      isDragging={isDragging}
      dragHandle={
        // Widened hit area (≥32px) for thumbs; the grip glyph stays size-4 so the
        // visual is unchanged. dnd-kit's KeyboardSensor wires the full "space to
        // pick up, arrows to move" announcement via {...attributes}.
        <button
          type="button"
          aria-label={`Reorder ${activity.title}`}
          title="Drag to reorder, or focus and use the arrow keys"
          className="-ml-1 flex w-6 shrink-0 cursor-grab touch-none items-start justify-center self-start pt-2.5 text-muted-foreground/50 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing group-focus-within:opacity-100 group-hover:opacity-100 lg:opacity-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      }
    />
  );
}
