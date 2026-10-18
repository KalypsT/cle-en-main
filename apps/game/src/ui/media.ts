import { useEffect, useState } from 'react';

/** Wide screens (computer, tablet): the street on the left, the management on the right (docs/04, 4.1). */
export const WIDE_QUERY = '(min-width: 1000px)';
/** A phone held sideways: the « Rue » becomes a panorama, other screens ask to turn it back. */
export const PANORAMA_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** Follows a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}
