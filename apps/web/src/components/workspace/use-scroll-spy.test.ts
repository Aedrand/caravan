// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollSpy } from "./use-scroll-spy";

/** Anchor ids in document order — sections with interleaved day anchors. */
const ANCHOR_IDS = ["overview", "itinerary", "day-2026-10-01", "day-2026-10-02", "money"];

type IOCallback = (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;

/** Records observed elements and lets tests fire intersection entries by id. */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  static latest(): MockIntersectionObserver {
    const inst = MockIntersectionObserver.instances.at(-1);
    if (!inst) throw new Error("no IntersectionObserver was constructed");
    return inst;
  }

  readonly callback: IOCallback;
  readonly options: IntersectionObserverInit | undefined;
  observed: Element[] = [];

  constructor(callback: IOCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(el: Element): void {
    this.observed = this.observed.filter((o) => o !== el);
  }
  disconnect(): void {
    this.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// rAF queue the tests drain manually — the hook coalesces observer reports into
// ONE flush per animation frame, so tests control exactly when a frame happens.
let rafQueue: FrameRequestCallback[] = [];
function drainRaf(): void {
  while (rafQueue.length > 0) {
    const batch = rafQueue;
    rafQueue = [];
    for (const cb of batch) cb(0);
  }
}

let container: HTMLElement;
let scrollIntoViewMock: ReturnType<typeof vi.fn>;

/** Fire the hook's observer callback for the given ids, then run the rAF flush. */
function fireIntersections(states: Record<string, boolean>): void {
  const io = MockIntersectionObserver.latest();
  const entries = Object.entries(states).map(([id, isIntersecting]) => {
    const target = document.getElementById(id);
    if (!target) throw new Error(`no anchor element with id "${id}"`);
    return { target, isIntersecting } as unknown as IntersectionObserverEntry;
  });
  act(() => {
    io.callback(entries, io as unknown as IntersectionObserver);
    drainRaf();
  });
}

function dispatchScrollEnd(): void {
  act(() => {
    container.dispatchEvent(new Event("scrollend"));
  });
}

function renderScrollSpy() {
  return renderHook(() =>
    useScrollSpy({ containerRef: { current: container }, anchorIds: ANCHOR_IDS }),
  );
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  rafQueue = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // jsdom lacks matchMedia; the hook only reads `.matches` (reduced motion).
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false } as unknown as MediaQueryList),
  );
  // jsdom lacks scrollIntoView entirely.
  scrollIntoViewMock = vi.fn();
  Element.prototype.scrollIntoView =
    scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView;

  container = document.createElement("div");
  for (const id of ANCHOR_IDS) {
    const el = document.createElement("div");
    el.id = id;
    el.tabIndex = -1;
    container.appendChild(el);
  }
  document.body.appendChild(container);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useScrollSpy", () => {
  it("tracks the last intersecting anchor in document order (baseline)", () => {
    const { result } = renderScrollSpy();
    expect(result.current.activeId).toBeNull();
    // One observer, watching every anchor element.
    expect(MockIntersectionObserver.latest().observed.map((el) => el.id)).toEqual(ANCHOR_IDS);

    fireIntersections({ overview: true });
    expect(result.current.activeId).toBe("overview");

    // A later anchor enters while an earlier one still intersects → later wins.
    fireIntersections({ "day-2026-10-01": true });
    expect(result.current.activeId).toBe("day-2026-10-01");

    // ANCHOR order decides, not the entry order within the callback.
    fireIntersections({ money: true, "day-2026-10-02": true });
    expect(result.current.activeId).toBe("money");

    fireIntersections({ money: false, "day-2026-10-02": false, "day-2026-10-01": false });
    expect(result.current.activeId).toBe("overview");
  });

  it("scrollTo sets activeId to the target synchronously (optimistic jump)", () => {
    const { result } = renderScrollSpy();
    act(() => {
      result.current.scrollTo("money");
    });
    expect(result.current.activeId).toBe("money");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("ignores intermediate intersection reports while a programmatic scroll is in flight", () => {
    const { result } = renderScrollSpy();
    act(() => {
      result.current.scrollTo("money");
    });
    expect(result.current.activeId).toBe("money");

    // The smooth scroll sweeps past both day anchors; the observer reports
    // them, but activeId must not thrash through day-… values.
    fireIntersections({ "day-2026-10-01": true });
    expect(result.current.activeId).toBe("money");
    fireIntersections({ "day-2026-10-01": false, "day-2026-10-02": true });
    expect(result.current.activeId).toBe("money");
  });

  it("scrollend clears suppression and resyncs to the observer's true state", () => {
    const { result } = renderScrollSpy();
    act(() => {
      result.current.scrollTo("money");
    });
    fireIntersections({ "day-2026-10-02": true });
    expect(result.current.activeId).toBe("money"); // still frozen

    // Native scroll settles → trust the observer again, resync immediately.
    dispatchScrollEnd();
    expect(result.current.activeId).toBe("day-2026-10-02");

    // Suppression is gone: subsequent reports apply normally.
    fireIntersections({ "day-2026-10-02": false, money: true });
    expect(result.current.activeId).toBe("money");
  });

  it("falls back to a 1s timeout when scrollend never fires", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderScrollSpy();
    act(() => {
      result.current.scrollTo("money");
    });

    fireIntersections({ "day-2026-10-02": true });
    expect(result.current.activeId).toBe("money");

    // Just before the deadline, reports are still ignored…
    act(() => {
      vi.advanceTimersByTime(999);
    });
    fireIntersections({ "day-2026-10-01": true });
    expect(result.current.activeId).toBe("money");

    // …past it, suppression is cleared and the next report applies.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireIntersections({ "day-2026-10-01": false });
    expect(result.current.activeId).toBe("day-2026-10-02");
  });

  it("scrollTo on an unknown id is a no-op and does not suppress", () => {
    const { result } = renderScrollSpy();
    fireIntersections({ overview: true });
    act(() => {
      result.current.scrollTo("does-not-exist");
    });
    expect(result.current.activeId).toBe("overview");
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    // Not suppressed: reports still apply.
    fireIntersections({ money: true });
    expect(result.current.activeId).toBe("money");
  });
});
