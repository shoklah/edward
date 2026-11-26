import { FIRM, play } from './play.ts';

/** What arrives: `el` condenses from `from`, unseen, to its own state. */
export function condense(
  el: Element,
  { ms = 420, from = 'scale(0.97, 0.8)', easing = FIRM, delay = 0, origin = '0 0' }: { ms?: number; from?: string; easing?: string; delay?: number; origin?: string } = {},
): Animation | null {
  return play(
    'condense',
    el,
    [{ opacity: 0, transform: from, transformOrigin: origin }, { opacity: 1, offset: 0.3 }, { transformOrigin: origin }],
    ms,
    { easing, delay },
  );
}
