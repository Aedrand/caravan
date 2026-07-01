import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import {
  clampMapWidth,
  nextWidthFromDrag,
  readStoredMapWidth,
  writeStoredMapWidth,
} from "./map-width";

/**
 * State + pointer plumbing for the resizable ambient-map track. The width math
 * and persistence live in `map-width.ts` (pure, tested); this hook owns the
 * live drag. Pointer events are CAPTURED ON THE HANDLE (`setPointerCapture`),
 * not window listeners — a fast drag that crosses the MapLibre canvas must keep
 * routing to the handle instead of starting a map pan. Width persists to
 * localStorage on release (and on keyboard nudge), never per-move.
 */
export interface ResizableMapWidth {
  /** The current map-track width in px (clamped, persisted). */
  width: number;
  /** True mid-drag — callers should suspend the width transition. */
  resizing: boolean;
  /** Keyboard resize (± px), for the handle's ArrowLeft/ArrowRight parity. */
  nudge: (delta: number) => void;
  /** Spread onto the handle element (pointer capture lives there). */
  dragHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

/** `window.localStorage` access itself can throw (privacy modes) — soften it. */
function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function useResizableMapWidth(): ResizableMapWidth {
  const [width, setWidth] = useState(() => readStoredMapWidth(safeStorage()));
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  // Latest width for the release-time persist (avoids a side effect inside a
  // setState updater, which StrictMode may run twice).
  const widthRef = useRef(width);
  widthRef.current = width;

  const nudge = (delta: number) => {
    const next = clampMapWidth(widthRef.current + delta);
    setWidth(next);
    writeStoredMapWidth(safeStorage(), next);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: widthRef.current };
    setResizing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    setWidth(nextWidthFromDrag(dragRef.current.startWidth, dragRef.current.startX, event.clientX));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be gone (element re-render / pointer lost) — fine.
    }
    writeStoredMapWidth(safeStorage(), widthRef.current);
  };

  return {
    width,
    resizing,
    nudge,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
