import { useLayoutEffect, useRef, type RefObject } from 'react';
import { SOFT, motionRuns, play } from './play.ts';

/** What moves: `el` flows from `from`, relative to where it now is: it stretches over the gap, then gathers. */
export function flow(el: Element, from: { x: number; y: number }, pseudoElement?: '::before'): Animation | null {
  if (!from.x && !from.y) return null;
  // A side that doesn't stretch thins.
  const stretch = (gap: number, size: number) => {
    const by = 1 + gap / size;
    return by > 1.02 ? by : 0.9;
  };
  // Not `getBoundingClientRect`, which a flow under way scales.
  const sx = stretch(Math.min(Math.abs(from.x), 200) * 0.5, el.clientWidth);
  const sy = stretch(Math.min(Math.abs(from.y), 160) * 0.55, el.clientHeight);
  return play(
    'flow',
    el,
    [
      { transform: `translate(${from.x}px, ${from.y}px)` },
      { transform: `translate(${from.x / 2}px, ${from.y / 2}px) scale(${sx}, ${sy})`, offset: 0.3, easing: SOFT },
      { transform: 'none' },
    ],
    420,
    { easing: 'ease-in', pseudoElement },
  );
}

/** The pill of a `nav`'s current link, its `::before`, flows from the last current one's place once `path` changes. */
export function usePill(nav: RefObject<HTMLElement | null>, path: string): void {
  const last = useRef<Element | null>(null);
  const flowing = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    const was = last.current;
    const now = el?.querySelector('a[aria-current="page"]') ?? null;
    last.current = now;
    if (!el || !now || now === was || !el.contains(was) || !motionRuns()) return;
    const from = was!.getBoundingClientRect();
    const to = now.getBoundingClientRect();
    const animation = flow(now, { x: from.left - to.left, y: from.top - to.top }, '::before');
    if (!animation) return;
    flowing.current = animation;
    // The pill springs past its place, which must not make what holds the nav scroll.
    el.style.overflow = 'clip';
    animation.onfinish = () => {
      if (flowing.current === animation) el.style.overflow = '';
    };
  }, [nav, path]);
}
