import { useState, useCallback, useEffect, useRef } from 'react';

// Swipe panel widths
const SWIPE_WIDTH_NORMAL = 96;  // px – 2 buttons × 3rem (6rem)
const SWIPE_WIDTH_WIDE = 144;   // px – 3 buttons × 3rem (9rem)
const VELOCITY_THRESHOLD = 0.3; // px/ms – fast flick will snap even if distance is short

/** Determine swipe panel width from the element's class (set during render) */
const getSwipeWidth = (el: HTMLElement | null) =>
  el?.classList.contains('swiped-wide') ? SWIPE_WIDTH_WIDE : SWIPE_WIDTH_NORMAL;

export interface UseSwipeGestureReturn {
  swipedEntryId: number | null;
  setSwipedEntryId: React.Dispatch<React.SetStateAction<number | null>>;
  swipeDidDrag: React.MutableRefObject<boolean>;
  handleSwipePointerDown: (entryId: number, e: React.PointerEvent) => void;
  handleSwipePointerMove: (e: React.PointerEvent) => void;
  handleSwipePointerUp: (e: React.PointerEvent) => void;
  handleSwipeWheel: (entryId: number, e: React.WheelEvent) => void;
}

export function useSwipeGesture(): UseSwipeGestureReturn {
  // Swipe-to-reveal state for mobile entry actions
  const [swipedEntryId, setSwipedEntryId] = useState<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; id: number; time: number } | null>(null);
  const swipeOffsetRef = useRef<number>(0); // current drag offset in px (negative = swiping left)
  const swipeLocked = useRef<'horizontal' | 'vertical' | null>(null); // axis lock after initial movement
  const swipeEntryRef = useRef<HTMLDivElement | null>(null); // DOM ref for the currently-dragging entry
  const swipePointerId = useRef<number | null>(null); // pointer id for capture
  const swipeDidDrag = useRef(false); // true if the gesture was a real drag (not a tap) – used to suppress click
  const wheelAccum = useRef<{ id: number; dx: number; timer: ReturnType<typeof setTimeout> | null }>({ id: 0, dx: 0, timer: null }); // trackpad two-finger swipe accumulator

  // Apply inline transforms to the entry being dragged (avoids React re-renders during the gesture)
  const applySwipeTransform = useCallback((el: HTMLElement, offset: number) => {
    const w = getSwipeWidth(el);
    const content = el.querySelector('.entry-content') as HTMLElement | null;
    const actions = el.querySelector('.swipe-actions') as HTMLElement | null;
    if (content) content.style.transform = `translateX(${offset}px)`;
    if (actions) actions.style.transform = `translateX(${Math.max(0, w + offset)}px)`;
  }, []);

  // Clear inline styles and let CSS classes take over
  const clearSwipeTransform = useCallback((el: HTMLElement) => {
    const content = el.querySelector('.entry-content') as HTMLElement | null;
    const actions = el.querySelector('.swipe-actions') as HTMLElement | null;
    if (content) content.style.transform = '';
    if (actions) actions.style.transform = '';
  }, []);

  const handleSwipePointerDown = useCallback((entryId: number, e: React.PointerEvent) => {
    // If another entry is swiped open, close it immediately
    if (swipedEntryId !== null && swipedEntryId !== entryId) {
      setSwipedEntryId(null);
    }
    const el = e.currentTarget as HTMLDivElement;
    const w = getSwipeWidth(el);
    const startOffset = swipedEntryId === entryId ? -w : 0;
    swipeStartRef.current = { x: e.clientX, y: e.clientY, id: entryId, time: Date.now() };
    swipeOffsetRef.current = startOffset;
    swipeLocked.current = null;
    swipeEntryRef.current = el;
    swipePointerId.current = e.pointerId;
    // Don't capture yet — wait until pointerMove confirms a horizontal drag.
    // This lets clicks on child elements (inputs, selects, buttons, editable spans) work normally.
  }, [swipedEntryId]);

  const handleSwipePointerMove = useCallback((e: React.PointerEvent) => {
    if (!swipeStartRef.current || !swipeEntryRef.current) return;
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;

    // Lock to an axis after a small movement to avoid jank
    if (!swipeLocked.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // dead zone
      swipeLocked.current = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
      // Capture pointer only once we confirm a horizontal swipe
      if (swipeLocked.current === 'horizontal' && swipePointerId.current !== null) {
        try { swipeEntryRef.current.setPointerCapture(swipePointerId.current); } catch { /* ok */ }
      }
    }

    if (swipeLocked.current === 'vertical') return; // let the browser scroll

    const w = getSwipeWidth(swipeEntryRef.current);
    // Starting offset accounts for whether the entry was already swiped open
    const startOffset = swipedEntryId === swipeStartRef.current.id ? -w : 0;
    // Clamp offset between -w (fully open) and 0 (fully closed), with slight rubber-band
    const raw = startOffset + dx;
    const clamped = Math.max(-w - 20, Math.min(20, raw));
    // Apply rubber-band effect beyond bounds
    const offset = clamped < -w
      ? -w + (clamped + w) * 0.3
      : clamped > 0
        ? clamped * 0.3
        : clamped;

    swipeOffsetRef.current = offset;
    applySwipeTransform(swipeEntryRef.current, offset);
  }, [swipedEntryId, applySwipeTransform]);

  const handleSwipePointerUp = useCallback((e: React.PointerEvent) => {
    if (!swipeStartRef.current || !swipeEntryRef.current) return;
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    const dt = Date.now() - swipeStartRef.current.time;
    const entryId = swipeStartRef.current.id;
    const el = swipeEntryRef.current;

    // Release pointer capture
    if (swipePointerId.current !== null) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(swipePointerId.current); } catch { /* already released */ }
      swipePointerId.current = null;
    }

    swipeStartRef.current = null;
    swipeEntryRef.current = null;

    // If locked to vertical or barely moved, ignore
    if (swipeLocked.current === 'vertical' || (Math.abs(dx) < 10 && Math.abs(dy) < 10)) {
      swipeLocked.current = null;
      swipeDidDrag.current = false;
      return;
    }
    swipeLocked.current = null;
    swipeDidDrag.current = true; // mark that a real drag happened – suppress the upcoming click

    const velocity = Math.abs(dx) / Math.max(dt, 1); // px/ms
    const offset = swipeOffsetRef.current;
    const snapThreshold = getSwipeWidth(el) / 3;

    // Determine whether to snap open or closed
    const wasOpen = swipedEntryId === entryId;
    let shouldOpen: boolean;

    if (velocity > VELOCITY_THRESHOLD) {
      // Fast flick: direction determines outcome
      shouldOpen = dx < 0;
    } else {
      // Slow drag: threshold determines outcome
      shouldOpen = offset < -snapThreshold;
    }

    // Clear inline styles and let CSS transition handle the snap animation
    clearSwipeTransform(el);
    setSwipedEntryId(shouldOpen ? entryId : null);

    // If state didn't actually change, we still need to clear transforms
    if ((shouldOpen && wasOpen) || (!shouldOpen && !wasOpen)) {
      clearSwipeTransform(el);
    }
  }, [swipedEntryId, clearSwipeTransform]);

  // Two-finger trackpad swipe: accumulate horizontal wheel deltaX to open/close actions
  const handleSwipeWheel = useCallback((entryId: number, e: React.WheelEvent) => {
    // Ignore if predominantly vertical scroll
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) || Math.abs(e.deltaX) < 2) return;

    const acc = wheelAccum.current;

    // Reset accumulator if switching to a different entry
    if (acc.id !== entryId) {
      acc.id = entryId;
      acc.dx = 0;
    }

    acc.dx += e.deltaX;

    // Reset accumulator after a pause (gesture ended)
    if (acc.timer) clearTimeout(acc.timer);
    acc.timer = setTimeout(() => { acc.dx = 0; }, 200);

    const isOpen = swipedEntryId === entryId;
    const snapThreshold = getSwipeWidth(e.currentTarget as HTMLElement) / 3;

    if (!isOpen && acc.dx > snapThreshold) {
      // Scrolled right (deltaX positive = swipe left on trackpad) → open
      setSwipedEntryId(entryId);
      acc.dx = 0;
    } else if (isOpen && acc.dx < -snapThreshold) {
      // Scrolled left (deltaX negative = swipe right on trackpad) → close
      setSwipedEntryId(null);
      acc.dx = 0;
    }
  }, [swipedEntryId]);

  // Dismiss swiped entry on scroll or clicking/tapping outside
  useEffect(() => {
    if (swipedEntryId === null) return;
    const dismissOnScroll = () => setSwipedEntryId(null);
    const dismissOnClickOutside = (e: PointerEvent) => {
      // Don't dismiss if the click is inside the swiped entry itself (let its own handlers manage it)
      const target = e.target as HTMLElement;
      if (target.closest('.entry-item.swiped')) return;
      setSwipedEntryId(null);
    };
    window.addEventListener('scroll', dismissOnScroll, { passive: true, once: true });
    document.addEventListener('pointerdown', dismissOnClickOutside);
    return () => {
      window.removeEventListener('scroll', dismissOnScroll);
      document.removeEventListener('pointerdown', dismissOnClickOutside);
    };
  }, [swipedEntryId]);

  return {
    swipedEntryId,
    setSwipedEntryId,
    swipeDidDrag,
    handleSwipePointerDown,
    handleSwipePointerMove,
    handleSwipePointerUp,
    handleSwipeWheel,
  };
}
