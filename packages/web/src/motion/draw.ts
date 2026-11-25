import { useLayoutEffect, type RefObject } from 'react';
import { condense } from './condense.ts';
import { EASE_OUT, motionRuns, play } from './play.ts';
import { opaqueIn, takeArrival } from './wash.ts';

/** How far `(x, y)` is from `el`'s rectangle, both in its graph's own pixels, which no condensing panel scales. */
function away({ x, y }: DOMPoint, { offsetLeft, offsetTop, offsetWidth, offsetHeight }: HTMLElement): number {
  const over = (at: number, start: number, size: number) => Math.max(start - at, 0, at - start - size);
  return Math.hypot(over(x, offsetLeft, offsetWidth), over(y, offsetTop, offsetHeight));
}

/** Draws the graph in `frame` in its children's own order, reading order, each line after the child it leaves, all
 * `after` ms from now. */
export function draw(frame: HTMLElement, after: number): void {
  if (!motionRuns()) return;
  const items = [...frame.querySelectorAll<HTMLElement>(':scope > * > :not(svg, [data-ring])')];
  const delays = items.map((_, i) => after + (900 * i) / (items.length - 1));
  items.forEach((item, i) => condense(item, { ms: 180, from: 'scale(0.95)', easing: EASE_OUT, delay: delays[i], origin: 'center' }));
  for (const path of frame.querySelectorAll<SVGPathElement>(':scope > * > svg > path')) {
    const start = path.getPointAtLength(0);
    const far = items.map((item) => away(start, item));
    const delay = delays[far.indexOf(Math.min(...far))] + 60;
    if (path.hasAttribute('stroke-dasharray') || path.getAttribute('stroke')!.startsWith('url(')) {
      condense(path, { ms: 160, from: 'none', easing: EASE_OUT, delay });
      continue;
    }
    const length = path.getTotalLength();
    const held = { strokeDasharray: length, markerEnd: 'none' };
    play('flow', path, [{ ...held, strokeDashoffset: length }, { ...held, strokeDashoffset: 0 }], 260, { delay });
  }
}

/** The graph in `frame`, once `ready`, draws itself when a page switch brought the reader to it. */
export function useDraw(frame: RefObject<HTMLElement | null>, ready: boolean): void {
  useLayoutEffect(() => {
    if (!ready) return;
    // After the switch's `onRendered`, which comes before the next frame, and before that frame is painted.
    const id = requestAnimationFrame(() => {
      if (takeArrival()) draw(frame.current!, opaqueIn(frame.current!));
    });
    return () => cancelAnimationFrame(id);
  }, [frame, ready]);
}
