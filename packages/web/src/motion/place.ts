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
