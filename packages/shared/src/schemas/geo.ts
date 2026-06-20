import { z } from "zod";

/**
 * The normalized place shape returned by the geo proxy (C.1, TD-5). Every
 * provider — Photon (default), Geoapify, LocationIQ, Nominatim — is mapped to
 * this single shape server-side, so the browser never sees provider quirks or
 * keys. `provider`/`ref` carry provenance straight into an activity's
 * `placeProvider`/`placeRef` (PlaceSchema in activity.ts).
 */
export const GeoPlaceSchema = z.object({
  /** Human label for the place (street, POI name, locality…). */
  name: z.string().min(1).max(200),
  /** Fuller formatted address when the provider supplies one. */
  address: z.string().max(400).optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  /** Which provider answered — `photon`, `geoapify`, `locationiq`, `nominatim`. */
  provider: z.string().max(40),
  /** Provider-native id when available (e.g. OSM `node/123`), for provenance. */
  ref: z.string().max(200).optional(),
});
export type GeoPlace = z.infer<typeof GeoPlaceSchema>;

/** `GET /api/geo/search?q=` — forward geocoding / autocomplete. */
export const GeoSearchResponseSchema = z.object({
  results: z.array(GeoPlaceSchema),
});
export type GeoSearchResponse = z.infer<typeof GeoSearchResponseSchema>;

/** `GET /api/geo/reverse?lat=&lng=` — coordinate → address. */
export const GeoReverseResponseSchema = z.object({
  /** Null when the provider has nothing at that point (ocean, etc.). */
  place: GeoPlaceSchema.nullable(),
});
export type GeoReverseResponse = z.infer<typeof GeoReverseResponseSchema>;

/**
 * `GET /api/geo/map-config` (C.5) — everything the browser map needs, computed
 * server-side from TILE_PROVIDER + keys so tile keys are injected into the
 * style URL here, never exposed as bare env to the client. The default
 * (OpenFreeMap) is keyless and serves tiles straight from its CDN.
 */
export const MapConfigSchema = z.object({
  /** MapLibre style JSON URL — load directly from the browser (CDN caching). */
  styleUrl: z.string(),
  /** Attribution HTML/text the UI must keep visible (TD-5 / provider terms). */
  attribution: z.string(),
  /** Which provider produced styleUrl, for the UI to label. */
  tileProvider: z.string(),
});
export type MapConfig = z.infer<typeof MapConfigSchema>;
