/** DESIGN.md's four verbs (Motion); every animation carries its own as its `id`. */
export type Verb = 'wash' | 'condense' | 'ripple' | 'flow';

/** A damped spring as a `linear()` easing: a damping near 1 is stiff, near 0.4 is jelly. */
export function spring(damping: number): string {
  const steps = 40;
  const speed = 5.8 / damping;
  const turn = speed * Math.sqrt(1 - damping * damping);
  const at = (t: number) => 1 - Math.exp(-damping * speed * t) * (Math.cos(turn * t) + ((damping * speed) / turn) * Math.sin(turn * t));
  return `linear(${Array.from({ length: steps + 1 }, (_, i) => (i === steps ? 1 : at(i / steps).toFixed(4))).join(',')})`;
}

/** Pages, sorting and rows; `--spring-firm` in `index.css` is its text, for a switch's thumb. */
export const FIRM = spring(0.75);
/** Arrivals. */
export const SOFT = spring(0.55);
/** Numbers and bobs. */
export const JELLY = spring(0.38);
/** Everything inside a list: it never passes 1, so no row springs past its list's end. */
export const CALM = spring(0.95);
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Whether motion runs: not under reduced motion nor in a hidden page, read at each call, so a change counts at once. */
export function motionRuns(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden;
}

/** Plays `frames` on `el`, named by its verb; the app's one `Element.animate`. Null, and nothing plays, while motion is off. */
export function play(verb: Verb, el: Element, frames: Keyframe[], ms: number, options?: KeyframeAnimationOptions): Animation | null {
  if (!motionRuns()) return null;
  return el.animate(frames, { duration: ms, easing: EASE_OUT, fill: 'backwards', ...options, id: verb });
}
