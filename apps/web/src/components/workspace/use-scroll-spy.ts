import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Scrollspy for the V2.7 workspace canvas (§5). One `IntersectionObserver`
 * watches every section + day anchor inside the canvas scroll container and
 * reports which one the reader is "in"; `scrollTo(id)` smooth-scrolls the canvas
 * to an anchor (reduced-motion aware) and moves focus there for keyboard/SR
 * users. While a `scrollTo` is in flight, `activeId` is pinned to the target
 * (suppressing the observer's intermediate reports) until `scrollend` or a
 * fallback timeout. The hook is the ONLY place an IntersectionObserver is
 * created for scrollspy — callers see just `{ activeId, scrollTo }`, so the
 * mechanism is swappable without touching them.
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

  // While a programmatic scroll (`scrollTo`) is in flight, `activeId` is frozen
  // to the scroll target and the observer's intermediate enter/exit reports are
  // ignored. Without this, a smooth scroll past the Itinerary's day anchors
  // thrashes `activeId` through every `day-…` value it crosses (popping the
  // ambient map open and re-framing it per day). Cleared by `scrollend`
  // (primary) or a 1s timeout (fallback for engines without `scrollend`, or a
  // same-position scroll where no scroll events fire at all).
  const suppressedRef = useRef(false);
  const suppressTimeoutRef = useRef<number | null>(null);
  // The in-flight scroll target. A `scrollTo` can land SHORT: flipping
  // `activeId` optimistically opens the ambient map track, which narrows the
  // canvas and reflows every anchor downward while the smooth scroll is
  // mid-flight — the browser aims at the pre-reflow position. On settle we
  // measure the target and, once per scrollTo, finish the job with an instant
  // corrective scroll (else the resync lands on whatever section the shortfall
  // left in the band and, e.g., snaps the map straight back closed).
  const targetRef = useRef<{ id: string; corrected: boolean } | null>(null);
  // The settle logic lives in the effect (it needs `root`/`flush`); the
  // fallback timeout in `scrollTo` reaches it through this ref so engines
  // without `scrollend` get the same correction.
  const settleRef = useRef<(() => void) | null>(null);

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
      // Frozen during a programmatic scroll: `scrollTo` already set `activeId`
      // to the target optimistically. `flags` keeps recording throughout, so
      // the `scrollend` resync below sees the observer's true state.
      if (suppressedRef.current) return;
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

    // Settle a programmatic scroll: the moment the native scroll finishes
    // (`scrollend`, or the fallback timeout), either finish the job — one
    // instant corrective scroll if the target moved mid-flight (see
    // `targetRef`) — or trust the observer again and resync `activeId`.
    const settle = () => {
      if (suppressTimeoutRef.current !== null) {
        window.clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }
      if (!suppressedRef.current) return;
      const target = targetRef.current;
      if (target && !target.corrected) {
        const el = document.getElementById(target.id);
        if (el) {
          // Landed correctly = the anchor sits at the canvas top (± its
          // scroll-margin). Well beyond that means the layout shifted under
          // the scroll — correct once, still suppressed.
          const off = Math.abs(el.getBoundingClientRect().top - root.getBoundingClientRect().top);
          if (off > 48) {
            target.corrected = true;
            // Instant corrective scrolls re-fire `scrollend`; the short timeout
            // is the backup (and the only path when nothing needed to move).
            suppressTimeoutRef.current = window.setTimeout(settle, 250);
            el.scrollIntoView({ behavior: "auto", block: "start" });
            return;
          }
        }
      }
      targetRef.current = null;
      suppressedRef.current = false;
      flush();
    };
    settleRef.current = settle;
    root.addEventListener("scrollend", settle);

    return () => {
      observer.disconnect();
      settleRef.current = null;
      root.removeEventListener("scrollend", settle);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (suppressTimeoutRef.current !== null) {
        window.clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }
      // Don't leave the spy frozen across a re-subscribe (anchor set changed
      // mid-scroll): the new subscription starts un-suppressed.
      suppressedRef.current = false;
    };
  }, [anchorKey]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Optimistic jump: the rail highlight (and everything keyed off `activeId`,
    // e.g. the ambient map) lands on the destination immediately instead of
    // walking through every anchor the smooth scroll sweeps past.
    suppressedRef.current = true;
    targetRef.current = { id, corrected: false };
    setActiveId(id);
    if (suppressTimeoutRef.current !== null) {
      window.clearTimeout(suppressTimeoutRef.current);
    }
    // Fallback settle — `scrollend` never fires on engines without it, nor when
    // the target is already in view (no movement ⇒ no scroll events at all).
    // Routed through `settle` so those paths still get the position correction.
    suppressTimeoutRef.current = window.setTimeout(() => {
      suppressTimeoutRef.current = null;
      if (settleRef.current) settleRef.current();
      else {
        targetRef.current = null;
        suppressedRef.current = false;
      }
    }, 1000);
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
