import { useLayoutEffect, useRef, type RefObject } from 'react';
import { SOFT, motionRuns, play } from './play.ts';

/** What last flows in each container clipped for it. */
const flowing = new WeakMap<HTMLElement, Animation>();

/** What moves: `el` flows from `from`, relative to where it now is: it stretches over the gap, then gathers. It springs
 * past its place, so `within` is clipped while it does, for it not to make what holds it scroll. */
export function flow(el: Element, from: { x: number; y: number }, within?: HTMLElement | null, pseudoElement?: '::before'): void {
  if (!from.x && !from.y) return;
  // A side that doesn't stretch thins.
  const stretch = (gap: number, size: number) => {
    const by = 1 + gap / size;
    return by > 1.02 ? by : 0.9;
  };
  // Not `getBoundingClientRect`, which a flow under way scales.
  const sx = stretch(Math.min(Math.abs(from.x), 200) * 0.5, el.clientWidth);
  const sy = stretch(Math.min(Math.abs(from.y), 160) * 0.55, el.clientHeight);
  const animation = play(
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
  if (!animation || !within) return;
  flowing.set(within, animation);
  within.style.overflow = 'clip';
  animation.onfinish = () => {
    if (flowing.get(within) === animation) within.style.overflow = '';
  };
}

/** The pill of a `nav`'s current link, its `::before`, flows from the last current one's place once `path` changes. */
export function usePill(nav: RefObject<HTMLElement | null>, path: string): void {
  const last = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    const was = last.current;
    const now = el?.querySelector('a[aria-current="page"]') ?? null;
    last.current = now;
    if (!el || !now || now === was || !el.contains(was) || !motionRuns()) return;
    const from = was!.getBoundingClientRect();
    const to = now.getBoundingClientRect();
    flow(now, { x: from.left - to.left, y: from.top - to.top }, el, '::before');
  }, [nav, path]);
}
