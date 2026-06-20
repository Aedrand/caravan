import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

/**
 * A lightweight shared selection signal (Track C). The map and its activity
 * list both read/write the currently-highlighted activity, giving bidirectional
 * pin ↔ list highlighting without reworking the itinerary layout (C.3 scope
 * note). It's deliberately tiny and decoupled: any future itinerary-side
 * highlight can subscribe to the same signal at integration without changing
 * this contract.
 */
interface MapSelection {
  selectedId: string | null;
  select: (id: string | null) => void;
}

const MapSelectionContext = createContext<MapSelection | null>(null);

export function MapSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedId, select: setSelectedId }), [selectedId]);
  return <MapSelectionContext.Provider value={value}>{children}</MapSelectionContext.Provider>;
}

/** Read/write the shared map selection. Safe outside a provider (no-op signal). */
export function useMapSelection(): MapSelection {
  return useContext(MapSelectionContext) ?? { selectedId: null, select: () => {} };
}
