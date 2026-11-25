import type { Locator } from '@playwright/test';

/** Waits for the animations and transitions inside `locator` to end, since axe run mid-way reads their colours
 * half-way (a dialog condensing); a scroll-driven one (a list's edge cue) follows its scroll and never ends. */
export async function settled(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).filter((a) => a.timeline === document.timeline).map((a) => a.finished)));
}
