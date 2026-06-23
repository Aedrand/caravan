import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/**
 * The itinerary's "focused day" (the rail-highlighted ISO `YYYY-MM-DD`), shared
 * so the ambient map can frame *that day's* pins (the deferred C.4 follow-up).
 * Mirrors `MapSelectionProvider`: a tiny decoupled signal that survives the
 * map's lazy/Suspense boundary without prop-drilling. The itinerary writes it
 * (rail click / day hover); the map reads it to reframe on change.
 *
 * Deliberately optional — the mobile Map tab renders `<MapPanel>` *without* a
 * provider, so `useFocusedDay()` returns a no-op signal there and the map keeps
 * its fit-all-on-boot behavior (no itinerary, no focused day to follow).
 */
interface FocusedDay {
  /** ISO `YYYY-MM-DD` of the focused day, or null when nothing's focused. */
  focusedDay: string | null;
  setFocusedDay: (iso: string | null) => void;
}

const FocusedDayContext = createContext<FocusedDay | null>(null);

export function FocusedDayProvider({ children }: { children: ReactNode }) {
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const value = useMemo(() => ({ focusedDay, setFocusedDay }), [focusedDay]);
  return <FocusedDayContext.Provider value={value}>{children}</FocusedDayContext.Provider>;
}

/** Read/write the shared focused day. Safe outside a provider (no-op signal). */
export function useFocusedDay(): FocusedDay {
  return useContext(FocusedDayContext) ?? { focusedDay: null, setFocusedDay: () => {} };
}
