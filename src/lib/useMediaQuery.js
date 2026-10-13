'use client';
import { useEffect, useState } from 'react';

/** True while the CSS media query matches (false during server render and the first paint). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Phone layout breakpoint — keep in sync with the 768px media queries in globals.css. */
export const useIsMobile = () => useMediaQuery('(max-width: 768px)');
