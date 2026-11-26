export function centre({ left, top, width, height }: DOMRect): { x: number; y: number } {
  return { x: left + width / 2, y: top + height / 2 };
}

/** How far the farthest window corner is. */
export function reach(x: number, y: number): number {
  return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
}

/** Whether any of `el` is drawn in the window and, in a scrolling region, in what the region shows there. */
export function inWindow(el: Element): boolean {
  if (!el.checkVisibility()) return false;
  const region = el.closest('[data-scroll-cue], [data-slot="table-container"]');
  const boxes = [new DOMRect(0, 0, innerWidth, innerHeight), el.getBoundingClientRect(), ...(region ? [region.getBoundingClientRect()] : [])];
  const overlap = (from: 'left' | 'top', to: 'right' | 'bottom') => Math.max(...boxes.map((b) => b[from])) < Math.min(...boxes.map((b) => b[to]));
  return overlap('left', 'right') && overlap('top', 'bottom');
}

/** Whether the window is wide enough for the rail, the copy, the cut and the bend. */
export function wide(): boolean {
  return window.matchMedia('(min-width: 768px)').matches;
}

/** The last link pressed, unless in a dialog: where it stood then, its text's size when it was in the page, and when. */
let pressed: { rect: DOMRect; link: { size: number } | null; at: number } | null = null;
document.addEventListener(
  'click',
  ({ target }) => {
    const link = target instanceof Element && target.closest('a[href]');
    if (!link) return;
    pressed = link.closest('[role="dialog"]')
      ? null
      : {
          rect: link.getBoundingClientRect(),
          link: link.closest('#main') && { size: parseFloat(getComputedStyle(link).fontSize) },
          at: performance.now(),
        };
  },
  true,
);

/** Where a wave starts when nothing it could start from shows. */
const TOP_LEFT = new DOMRect(12, 12, 60, 36);

/** The rectangle of the first of `places` that shows, else the top left. */
function firstShown(...places: string[]): DOMRect {
  const shown = places.flatMap((place) => [...document.querySelectorAll(place)]).find((el) => el.checkVisibility());
  return shown?.getBoundingClientRect() ?? TOP_LEFT;
}

/** Where a load started at `now` was called from: the link just pressed, once (with its text's size when it was in the
 * page), else the rail's current entry, the Menu button or the top left, whichever shows. */
export function sourceOf(now: number): { rect: DOMRect; link: { size: number } | null } {
  const last = pressed;
  pressed = null;
  if (last && now - last.at < 1000) return { rect: last.rect, link: last.link };
  return { rect: firstShown('aside nav a[aria-current="page"]', 'header [aria-haspopup="dialog"]'), link: null };
}

/** Where an import's wave starts: the "Imported" line, else the Refresh button, else the top left, whichever shows. */
export function importSource(): { x: number; y: number } {
  return centre(firstShown('[data-imported]', '[data-refresh]'));
}
