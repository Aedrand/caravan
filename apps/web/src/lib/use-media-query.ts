import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render on match changes. SSR-safe
 * (assumes no match until mounted) and listener-cleaned on unmount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync in case the query changed between render and effect
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * True at Tailwind's `lg` breakpoint and up (≥1024px) — the line where the trip
 * workspace switches from the mobile bottom-tab nav (with its own Map tab) to
 * the desktop left rail (Plan keeps its ambient map split).
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
