import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Scrollspy for the V2.7 workspace canvas (§5). One `IntersectionObserver`
 * watches every section + day anchor inside the canvas scroll container and
 * reports which one the reader is "in"; `scrollTo(id)` smooth-scrolls the canvas
 * to an anchor (reduced-motion aware) and moves focus there for keyboard/SR
 * users. The hook is the ONLY place an IntersectionObserver is created for
 * scrollspy — callers see just `{ activeId, scrollTo }`, so the mechanism is
 * swappable without touching them.
 */
export interface UseScrollSpyReturn {
  activeId: string | null;
  scrollTo: (id: string) => void;
}

export function useScrollSpy({
  containerRef,
  anchorIds,
}: {
  /** The single overflow-y-auto canvas. `root` for the observer — NOT `null`
   * (the page itself doesn't scroll; only this container does). */
  containerRef: RefObject<HTMLElement | null>;
  /** Anchor ids in document order: section ids + interleaved `day-${iso}`. */
  anchorIds: string[];
}): UseScrollSpyReturn {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Most-recent intersecting flag per id, coalesced into ONE state write per
  // animation frame (an observer callback can fire for many anchors at once).
  const intersecting = useRef<Map<string, boolean>>(new Map());
  const rafRef = useRef<number | null>(null);
  // The latest anchor order, read inside the rAF flush without re-subscribing.
  const orderRef = useRef(anchorIds);
  orderRef.current = anchorIds;

  // A stable primitive dependency so the effect re-subscribes only when the SET
  // of anchors changes (a date edit adds/removes a day), not on every render.
  const anchorKey = anchorIds.join("|");

  // `containerRef` is a stable ref object and `anchorKey` is the intentional
  // re-subscribe trigger (the observer reads the latest order via `orderRef`
  // inside the rAF flush) — re-observe only when the anchor SET changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable-ref read + key-trigger dep (see note above)
  useEffect(() => {
    const root = containerRef.current;
    // Null-ref guard (gotcha #2): the canvas renders unconditionally, so refs
    // are attached before this layout-after effect runs; bail safely otherwise.
    if (!root) return;

    const flags = intersecting.current;
    flags.clear();

    const flush = () => {
      rafRef.current = null;
      // `activeId` = the LAST anchor (in document order) currently intersecting
      // the top strip — i.e. "which section am I in?".
      let last: string | null = null;
      for (const id of orderRef.current) {
        if (flags.get(id)) last = id;
      }
      setActiveId(last);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          flags.set(entry.target.id, entry.isIntersecting);
        }
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
      },
      // Fire when an anchor crosses into the top 10% strip of the canvas.
      { root, rootMargin: "0px 0px -90% 0px", threshold: 0 },
    );

    for (const id of orderRef.current) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [anchorKey]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    // Move focus for a11y (anchors carry tabIndex=-1). `preventScroll` keeps the
    // focus call from instantly re-scrolling and fighting the smooth animation.
    el.focus({ preventScroll: true });
  }, []);

  return { activeId, scrollTo };
}
