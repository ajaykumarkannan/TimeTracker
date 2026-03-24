import { useEffect, RefObject } from 'react';

/**
 * Calls `handler` when a mousedown event occurs outside the provided ref(s).
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  handler: () => void
) {
  useEffect(() => {
    const refArray = Array.isArray(refs) ? refs : [refs];
    const listener = (e: MouseEvent) => {
      for (const ref of refArray) {
        if (ref.current && ref.current.contains(e.target as Node)) return;
      }
      handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  });
}
