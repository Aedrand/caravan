import type { RouteMode } from "../schemas/route";

/**
 * Routing helpers (V2.5). Pure: no IO, no React, no DB — shared by the server
 * proxy and the client hook so "which mode does this day route in?" resolves
 * identically on both sides.
 */

/**
 * A day's effective routing mode: the per-day override when set, else the
 * trip's default. `null` override means "inherit the trip default" (distinct
 * from a deliberate choice), so the trip default is the fallback.
 */
export function effectiveRouteMode(
  tripDefault: RouteMode,
  dayOverride: RouteMode | null,
): RouteMode {
  return dayOverride ?? tripDefault;
}
