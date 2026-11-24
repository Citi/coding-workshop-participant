/**
 * Hook that reports an element's rendered width and follows its resizes.
 */
import { useEffect, useState } from 'react';

/**
 * Track an element's content width with a ResizeObserver, for layouts that must be computed in
 * pixels (such as room for chart labels).
 * @example
 * const [ref, width] = useElementWidth();
 * return <Box ref={ref}>{width > 0 ? <Chart width={width} /> : null}</Box>;
 * @returns {[(node: Element|null) => void, number]} A callback ref for the element, and its width in
 *   whole pixels: 0 until measured, and always 0 where ResizeObserver is missing (for example jsdom).
 */
export function useElementWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) {
        setWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
}

export default useElementWidth;
