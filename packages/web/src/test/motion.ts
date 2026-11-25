import { createElement, Fragment, useState, type ReactNode } from 'react';
import { expect, spyOn } from 'storybook/test';
import { useLanding } from '../motion/index.ts';

const matchMedia = window.matchMedia.bind(window);
const FIRST = '2000-01-01T00:00:00.000Z';

/** Turns motion on, which the tests' browser has reduced, until `mockRestore`; a story's end restores it too. */
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
 * lets it finish, as it would have. Fails when nothing plays. */
export async function eachFrame(root: Element, check: () => void): Promise<void> {
  const all = animations(root);
  expect(all.filter(({ playState }) => playState === 'running').length).toBeGreaterThan(0);
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

/** The other links of `nav` whose centre `current`'s pill now covers: it lies under each, on `nav`. */
export function crossed(nav: Element, current: Element): Element[] {
  return [...nav.querySelectorAll('a')].filter((link) => {
    const { x, y, width, height } = link.getBoundingClientRect();
    const layers = document.elementsFromPoint(x + width / 2, y + height / 2);
    if (link === current || !layers.includes(current)) return false;
    expect(layers.filter((el) => [link, current, nav].includes(el))).toEqual([link, current, nav]);
    return true;
  });
}

/** What assistive tech reads of `el`: its text without what is hidden from it. */
export function accessibleText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent;
}

/** What `draw` draws before an import and, once the Import button is pressed, `landed` with it. */
export function Import({ draw }: { draw: (landed: boolean) => ReactNode }): ReactNode {
  const [at, setAt] = useState(FIRST);
  useLanding('/api/story', { lastImportAt: at, lastGoodImportAt: at, error: null, importing: false }, true);
  return createElement(
    Fragment,
    null,
    createElement('button', { type: 'button', onClick: () => setAt(new Date().toISOString()) }, 'Import'),
    draw(at !== FIRST),
  );
}
