import type { GeoPlace } from "@caravan/shared";
import { Loader2, MapPin } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * Place autocomplete for the activity form (C.2, TD-5). A debounced search
 * over /api/geo/search drops a suggestion list under the input; picking one
 * captures full provenance (lat/lng/provider/ref). Crucially, freeform text
 * still saves — an unmatched typed location is normal, not an error (PD-1).
 *
 * Contract with the parent:
 *  - `value` is the visible text (the place name or whatever the user typed).
 *  - `onTextChange` fires on every keystroke and clears any picked coordinates.
 *  - `onPick` fires when a suggestion is chosen, carrying the full GeoPlace.
 */
export function PlaceAutocomplete({
  value,
  onTextChange,
  onPick,
  picked,
  inputId,
  placeholder,
}: {
  value: string;
  onTextChange: (text: string) => void;
  onPick: (place: GeoPlace) => void;
  /** True once a suggestion has been selected (shows the located affordance). */
  picked: boolean;
  inputId?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause searching once the user has picked (avoids re-querying the chosen label).
  const search = usePlaceSearch(value, open && !picked);
  const results = search.data?.results ?? [];

  function choose(place: GeoPlace) {
    onPick(place);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Only intercept Enter when a suggestion is actively highlighted.
      const choice = results[highlight];
      if (choice) {
        e.preventDefault();
        choose(choice);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Open the dropdown for results, the searching state, or a failed lookup — a
  // down geocoder shouldn't fail silently (freeform text still saves, PD-1).
  const showList = open && !picked && (results.length > 0 || search.isFetching || search.isError);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          maxLength={200}
          placeholder={placeholder ?? "Search a place, or type a location"}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className="pr-8"
          onChange={(e) => {
            onTextChange(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion registers before we close.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
        />
        <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 text-muted-foreground">
          {search.isFetching ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <MapPin aria-hidden className="size-4" />
          )}
        </span>
      </div>

      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Place suggestions"
          className="cv-card absolute z-20 mt-1 max-h-64 w-full overflow-auto p-1"
          onMouseDown={() => {
            // Keep focus from bailing before onClick runs.
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {results.length === 0 && search.isFetching && (
            <p className="px-3 py-2 text-muted-foreground text-sm">Searching…</p>
          )}
          {!search.isFetching && search.isError && (
            <p role="alert" className="px-3 py-2 text-destructive text-sm">
              Couldn't reach place search. You can still type a location.
            </p>
          )}
          {results.map((place, i) => (
            <button
              key={`${place.provider}:${place.ref ?? `${place.lat},${place.lng}`}`}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(place)}
              className={cn(
                "flex w-full items-start gap-2 rounded-control px-2.5 py-2 text-left text-sm",
                i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{place.name}</span>
                {place.address && (
                  <span className="block truncate text-muted-foreground text-xs">
                    {place.address}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
