import { wide } from './place.ts';
import { motionRuns } from './play.ts';

/** A wave's front: where it starts in the window, how far it goes, in what time and how it slows (`pow`). */
export type Front = { x: number; y: number; R: number; ms: number; pow: number };

/** Whether an element can be drawn through the filters: only Chromium refracts, and only from 768 px. */
function refracts(): boolean {
  return (navigator as { userAgentData?: unknown }).userAgentData !== undefined && wide();
}

/** Takes the running filter or cut off. */
let end: (() => void) | null = null;

/** Whether a filter or cut runs. */
export function bending(): boolean {
  return end !== null;
}

/** Takes every running filter or cut off at once. */
export function endBends(): void {
  end?.();
}

/** Calls `draw` with the share of `ms` gone, now and each frame until it is done, then `off`. One runs at a time. */
function run(ms: number, draw: (done: number) => void, off: () => void): void {
  endBends();
  const start = performance.now();
  let next = 0;
  end = () => {
    cancelAnimationFrame(next);
    removeEventListener('scroll', endBends);
    off();
    end = null;
  };
  const tick = (now: number) => {
    const done = Math.max(0, now - start) / ms;
    if (done >= 1) return endBends();
    draw(done);
    next = requestAnimationFrame(tick);
  };
  tick(start);
}

/** How far a front is at a share of its time. */
export function frontAt({ R, pow }: Pick<Front, 'R' | 'pow'>, done: number): number {
  return R * (1 - (1 - done) ** pow);
}

/** How many ms until a front is `distance` px from its source; what is past its end, just before it is done. */
export function reaches(distance: number, { R, ms, pow }: Pick<Front, 'R' | 'ms' | 'pow'>): number {
  return (1 - (1 - Math.min(0.97, distance / R)) ** (1 / pow)) * ms;
}

/** Draws `el` through a filter along a front: `bend` bends it, until the window scrolls, and `wash` also removes what
 * the front has passed, calling `ended` as it comes off. Where nothing refracts, the first does nothing and the second
 * only cuts. */
export function bend(el: HTMLElement, front: Front, kind: 'bend' | 'wash', ended?: () => void): void {
  if (!motionRuns()) return;
  if (!refracts()) {
    if (kind === 'wash') cut(el, front, ended);
    return;
  }
  const { left, top } = el.getBoundingClientRect();
  const filter = document.querySelector(`#motion-${kind}`)!;
  const images = filter.querySelectorAll('feImage');
  const displacement = filter.querySelector('feDisplacementMap')!;
  const place = (node: Element, x: number, y: number, width: number, height: number) => {
    for (const [name, value] of Object.entries({ x, y, width, height })) node.setAttribute(name, String(value));
  };
  // The filter's units are el's own: its region is the window as it is now.
  place(filter, -left, -top, innerWidth, innerHeight);
  run(
    front.ms,
    (done) => {
      // The ring's crest is at 0.8 of its map.
      const half = frontAt(front, done) / 0.8;
      for (const image of images) place(image, front.x - left - half, front.y - top - half, 2 * half + 1, 2 * half + 1);
      displacement.setAttribute('scale', (46 * Math.min(1, done * 8) * (1 - done) ** 0.6).toFixed(2));
    },
    () => {
      el.style.filter = '';
      ended?.();
    },
  );
  el.style.filter = `url(#motion-${kind})`;
  if (kind === 'bend') addEventListener('scroll', endBends);
}

/** Cuts away what the front has passed. */
function cut(el: HTMLElement, front: Front, ended?: () => void): void {
  const { left, top, width, height } = el.getBoundingClientRect();
  run(
    front.ms,
    (done) => {
      const r = frontAt(front, done);
      const circle = `M${front.x - left - r} ${front.y - top}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
      el.style.clipPath = `path(evenodd, "M0 0H${width}V${height}H0Z ${circle}")`;
    },
    () => {
      el.style.clipPath = '';
      ended?.();
    },
  );
}
