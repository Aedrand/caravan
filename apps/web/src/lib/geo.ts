import type { GeoSearchResponse, MapConfig } from "@caravan/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Web-side geo client (Track C). All requests hit our own /api/geo proxy
 * (never a geocoder directly): keys stay server-side, responses are cached,
 * and the debounce here keeps us inside Photon's ≤1 req/s courtesy budget
 * (TD-5).
 */

/** Debounce any fast-changing value (autocomplete keystrokes). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const SEARCH_DEBOUNCE_MS = 350; // ≥300ms per TD-5.

/**
 * Place autocomplete for a query box. Debounces, skips queries <2 chars, and
 * caches per query so reopening the same search is instant. `enabled` lets a
 * caller pause it (e.g. right after the user picks a result).
 */
export function usePlaceSearch(query: string, enabled = true) {
  const debounced = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const active = enabled && debounced.length >= 2;
  return useQuery({
    queryKey: ["geo", "search", debounced],
    queryFn: () =>
      apiFetch<GeoSearchResponse>(`/api/geo/search?q=${encodeURIComponent(debounced)}`),
    enabled: active,
    staleTime: 5 * 60 * 1000, // addresses don't move; reuse within a session
  });
}

/** Map style + attribution, computed by the server from the host's config (C.5). */
export function useMapConfig() {
  return useQuery({
    queryKey: ["geo", "map-config"],
    queryFn: () => apiFetch<MapConfig>("/api/geo/map-config"),
    staleTime: Number.POSITIVE_INFINITY, // fixed per deployment
  });
}
