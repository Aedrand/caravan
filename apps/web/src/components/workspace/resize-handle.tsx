import { cn } from "@/lib/utils";
import { MAP_WIDTH_MAX, MAP_WIDTH_MIN } from "./map-width";
import type { ResizableMapWidth } from "./use-resizable-map-width";

/** Keyboard resize step (px) — parity with the app's other draggable handles. */
const KEYBOARD_STEP = 24;

/**
 * The canvas/map splitter — a thin vertical grip between the scrolling canvas
 * and the ambient map track (desktop only; mobile uses the full-screen map
 * overlay, nothing to resize). ARIA window-splitter pattern: a focusable
 * `role="separator"` with value semantics; ArrowLeft widens the map (the handle
 * sits on the map's left edge), ArrowRight narrows it. Drag state lives in
 * `useResizableMapWidth` — spread its `dragHandlers` here so pointer capture
 * lands on this element.
 */
export function MapResizeHandle({
  width,
  nudge,
  dragHandlers,
}: {
  width: number;
  nudge: ResizableMapWidth["nudge"];
  dragHandlers: ResizableMapWidth["dragHandlers"];
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: ARIA window-splitter = a FOCUSABLE role="separator" with value semantics + arrow-key resize — <hr> can't take focus, keys, or pointer capture
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize map"
      aria-valuemin={MAP_WIDTH_MIN}
      aria-valuemax={MAP_WIDTH_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          nudge(KEYBOARD_STEP);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          nudge(-KEYBOARD_STEP);
        }
      }}
      {...dragHandlers}
      className={cn(
        "group hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:flex",
      )}
    >
      <span
        aria-hidden
        className="h-12 w-[3px] rounded-pill bg-[var(--ink-faint)] transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-muted-foreground"
      />
    </div>
  );
}
