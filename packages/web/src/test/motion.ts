import { expect, spyOn } from 'storybook/test';

const matchMedia = window.matchMedia.bind(window);

/** Turns motion on, which the tests' browser has reduced, until `mockRestore`. */
export function motionOn(): { mockRestore(): void } {
  return spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === '(prefers-reduced-motion: reduce)' ? ({ matches: false } as MediaQueryList) : matchMedia(query),
  );
}

/** The animations of `motion/` under `root`, each named by its verb (a stylesheet's have no `id`). */
const animations = (root: Element) => root.getAnimations({ subtree: true }).filter(({ id }) => id !== '');

/** What plays under `root`: each animation's verb, its duration and what it moves. */
export function played(root: Element): { verb: string; ms: number; el: Element }[] {
  return animations(root).map(({ id, effect }) => ({
    verb: id,
    ms: effect!.getTiming().duration as number,
    el: (effect as KeyframeEffect).target!,
  }));
}

/** Finishes what plays under `root`. */
export function finish(root: Element): void {
  for (const animation of animations(root)) animation.finish();
}

/** Steps what plays under `root` through one clock to its end, in 40 steps, calling `check` in a frame after each; then
 * lets it finish, as it would have. */
export async function eachFrame(root: Element, check: () => void): Promise<void> {
  const all = animations(root);
  for (const animation of all) animation.pause();
  const end = Math.max(...all.map(({ effect }) => effect!.getComputedTiming().endTime as number));
  for (let step = 1; step <= 40; step++) {
    for (const animation of all) animation.currentTime = (end * step) / 40;
    await new Promise(requestAnimationFrame);
    check();
  }
  for (const animation of all) animation.finish();
}

/** Nothing in `scroller` makes it scroll, nor its edge fade. */
export function fits(scroller: Element): void {
  expect(scroller.scrollWidth).toBe(scroller.clientWidth);
  expect(scroller.scrollHeight).toBe(scroller.clientHeight);
  expect(getComputedStyle(scroller).maskImage).toBe('none');
}
