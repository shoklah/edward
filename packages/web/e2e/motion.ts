import type { Page } from '@playwright/test';

type Added = { copies: number; canvases: number; most: number };

/** Counts, from the next load on, the copies and the wave canvases added to the page and the most copies at once, what
 * is run unseen to prepare aside. */
export async function watchAdded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const added = ((window as unknown as { added: Added }).added = { copies: 0, canvases: 0, most: 0 });
    const copies = '[data-copy]:not([data-copy="prepare"])';
    const waves = new WeakSet<Node>();
    new MutationObserver((records) => {
      for (const { target, addedNodes } of records) {
        for (const node of [target, ...addedNodes]) {
          if (!(node instanceof HTMLElement)) continue;
          if (node !== target && node.matches(copies)) added.copies += 1;
          // A warmed canvas becomes a wave's without being added again, and a wave's is added again at each wave.
          if (node.dataset.water === 'wave' && (node !== target || !waves.has(node))) {
            waves.add(node);
            added.canvases += 1;
          }
        }
      }
      added.most = Math.max(added.most, document.querySelectorAll(copies).length);
    }).observe(document, { childList: true, subtree: true, attributeFilter: ['data-water'] });
  });
}

export async function added(page: Page): Promise<Added> {
  return page.evaluate(() => (window as unknown as { added: Added }).added);
}

/** One call of `Element.animate`: its verb and times, and what it plays on. */
export type Played = { verb: string; ms: number; delay: number; tag: string; ring: boolean; inFlow: boolean };

/** Keeps, from the next load on, all that is played in the page. */
export async function watchPlayed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const played: Played[] = ((window as unknown as { played: Played[] }).played = []);
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames, options) {
      const { id, duration, delay } = options as KeyframeAnimationOptions;
      const inFlow = this.closest('[aria-label="The run\'s flow"]') !== null;
      played.push({ verb: id!, ms: duration as number, delay: delay ?? 0, tag: this.tagName, ring: this.hasAttribute('data-ring'), inFlow });
      return animate.call(this, frames, options);
    };
  });
}

/** All that was played since the last time it was read. */
export async function takePlayed(page: Page): Promise<Played[]> {
  return page.evaluate(() => (window as unknown as { played: Played[] }).played.splice(0));
}

/** Until what the last change started has started. */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** What `motion/` plays in the page: each animation's verb and duration. */
export async function playing(page: Page): Promise<{ verb: string; ms: number }[]> {
  return page.evaluate(() =>
    document.getAnimations().filter((a) => a.id !== '').map((a) => ({ verb: a.id, ms: a.effect!.getTiming().duration as number })));
}

/** Answers the API path `path` with its own data changed by `change`. */
export const answerEdited = (page: Page, path: string, change: (body: any) => void) =>
  page.route(({ pathname }) => pathname === path, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    change(body);
    await route.fulfill({ response, json: body });
  });

/** A promise, and what settles it. */
export function hold(): { held: Promise<void>; release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  return { held, release };
}

/** Lands an import, with no import on the server: each path of `edits` (a page's API path) answers its own data changed
 * by its function, under a later import's status, once Refresh is pressed and answered (at `answer`, when given). */
export async function landImport(page: Page, edits: Record<string, (body: any) => void>, answer?: Promise<void>): Promise<void> {
  for (const [path, change] of Object.entries(edits)) await answerEdited(page, path, change);
  await answerEdited(page, '/api/status', (status) => (status.lastGoodImportAt = '2026-11-12T12:30:00.000Z'));
  await page.route('**/api/refresh', async (route) => {
    await answer;
    await route.fulfill({ status: 204 });
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
}
