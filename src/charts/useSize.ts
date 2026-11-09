import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Tracks an element's content width with a ResizeObserver. Uses `initial` until measured. */
export function useSize<T extends HTMLElement = HTMLDivElement>(
  initial = 320,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number) => {
      if (Number.isFinite(w) && w > 0) setWidth(Math.round(w));
    };
    read(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) read(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
