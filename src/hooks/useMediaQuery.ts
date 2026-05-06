/**
 * useMediaQuery — subscribe to a CSS media query.
 *
 * Returns true while the query matches. SSR-safe (returns false until the
 * first client render).
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** Below 768px counts as mobile in this app. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
