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

/** What `motion/` plays in the page: each animation's verb and duration. */
export async function playing(page: Page): Promise<{ verb: string; ms: number }[]> {
  return page.evaluate(() =>
    document.getAnimations().filter((a) => a.id !== '').map((a) => ({ verb: a.id, ms: a.effect!.getTiming().duration as number })));
}

/** Lands an import, with no import on the server: each path of `edits` (a page's API path) answers its own data changed
 * by its function, under a later import's status, once Refresh is pressed and answered (at `answer`, when given). */
export async function landImport(page: Page, edits: Record<string, (body: any) => void>, answer?: Promise<void>): Promise<void> {
  const edit = (path: string, change: (body: any) => void) =>
    page.route(({ pathname }) => pathname === path, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      change(body);
      await route.fulfill({ response, json: body });
    });
  for (const [path, change] of Object.entries(edits)) await edit(path, change);
  await edit('/api/status', (status) => (status.lastGoodImportAt = '2026-11-12T12:30:00.000Z'));
  await page.route('**/api/refresh', async (route) => {
    await answer;
    await route.fulfill({ status: 204 });
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
}
