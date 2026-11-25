/** How many things in flight each element is clipped for. */
const flying = new WeakMap<HTMLElement, number>();

/** Clips `el`, the app's root unless told, until `end` settles and nothing else in flight needs it clipped, so what is in
 * flight in it makes nothing scroll; `clip` makes no scroller, so the sticky rail and feed still stick. */
export function clip(end: Promise<unknown>, el = document.getElementById('root')): void {
  if (!el) return;
  flying.set(el, (flying.get(el) ?? 0) + 1);
  el.style.overflow = 'clip';
  const lift = () => {
    const left = flying.get(el)! - 1;
    flying.set(el, left);
    if (!left) el.style.overflow = '';
  };
  // A cancelled animation's end is a rejection.
  end.then(lift, lift);
}
