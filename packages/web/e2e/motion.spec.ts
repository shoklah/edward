import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { pinClock } from './fixed-time.ts';
import { added, playing, watchAdded } from './motion.ts';
import { settled } from './settled.ts';

// The one e2e file with motion on: the others run under reduced motion (`playwright.config.ts`).

test.use({ reducedMotion: 'no-preference' });
test.beforeEach(({ page }) => pinClock(page));

test('hover, presses and focus are instant; a thumb, a dialog and a tooltip have their times', async ({ page }) => {
  await page.goto('/work?view=sessions', { waitUntil: 'networkidle' });
  // A probe with a slot's attributes, so a state shown for 120 ms is read without a race.
  const style = (attributes: Record<string, string>, property: string, tag = 'div') =>
    page.evaluate(([attributes, property, tag]) => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
      document.body.append(el);
      const read = getComputedStyle(el).getPropertyValue(property);
      el.remove();
      return read;
    }, [attributes, property, tag] as const);
  for (const el of ['[data-variant][data-size]', '[data-slot="table-row"]', '[data-slot="switch"]']) {
    expect(await page.locator(el).first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  }
  expect(await style({ 'data-slot': 'input' }, 'transition-duration', 'input')).toBe('0s');
  expect(await style({ 'data-slot': 'dialog-close', class: 'transition-opacity' }, 'transition-duration')).toBe('0s');
  const thumb = page.locator('[data-slot="switch-thumb"]').first();
  expect(await thumb.evaluate((e) => [getComputedStyle(e).transitionProperty, getComputedStyle(e).transitionDuration])).toEqual(['translate', '0.16s']);
  for (const slot of ['dialog-content', 'dialog-overlay']) {
    expect(await style({ 'data-slot': slot, 'data-state': 'closed' }, 'animation-duration')).toBe('0.12s');
  }
  expect(await style({ 'data-slot': 'tooltip-content' }, 'animation-duration')).toBe('0.2s');
  await page.getByRole('complementary').getByRole('switch', { name: 'Showing mode' }).click();
  expect(await page.getByRole('dialog').evaluate((e) => getComputedStyle(e).animationDuration)).toBe('0.2s');
});

test.describe('the page switch', () => {
  test.beforeEach(({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  const rail = (page: Page) => page.getByRole('complementary').getByRole('navigation', { name: 'Main' });
  const copy = (page: Page) => page.locator('[data-copy="page"]');
  /** Until the wave and what condensed in it are over. */
  const rested = async (page: Page) => {
    await expect(copy(page)).toHaveCount(0);
    await expect.poll(async () => (await playing(page)).length).toBe(0);
  };

  test('a rail press leaves one copy, inert and hidden, gone after the wave, and the new page answers at once', async ({ page }) => {
    // Work's data cached, so its page is whole at its first frame.
    await page.goto('/work', { waitUntil: 'networkidle' });
    await rail(page).getByRole('link', { name: 'Weeks' }).click();
    await expect(copy(page)).toHaveCount(1);
    expect(await copy(page).evaluate((el: HTMLElement) => [el.inert, el.getAttribute('aria-hidden')])).toEqual([true, 'true']);
    expect((await playing(page)).filter((a) => a.verb === 'condense').map((a) => a.ms)).toContain(640);
    await expect(copy(page)).toHaveCount(0);
    // In one go: press Work, wait for its copy, and click what is at the moving Runs button's centre. Playwright's own
    // click would wait for the button to rest.
    const hit = await page.evaluate(async () => {
      [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === 'Work')!.click();
      while (!document.querySelector('[data-copy="page"]')) await new Promise(requestAnimationFrame);
      const runs = [...document.querySelectorAll<HTMLElement>('#main button')].find((b) => b.textContent === 'Runs')!;
      const { left, top, width, height } = runs.getBoundingClientRect();
      const at = document.elementFromPoint(left + width / 2, top + height / 2);
      at?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { runs: runs.contains(at), moving: document.getAnimations().some((a) => a.id === 'condense'), copies: document.querySelectorAll('[data-copy="page"]').length };
    });
    expect(hit).toEqual({ runs: true, moving: true, copies: 1 });
    await expect(page).toHaveURL(/view=runs$/);
    await expect(copy(page)).toHaveCount(0);
    await settled(page.getByRole('main'));
    await expect(page.locator('canvas[data-water]')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the copy never shows whole: it goes with its filter', async ({ page }) => {
    await page.goto('/work', { waitUntil: 'networkidle' });
    const filters = await page.evaluate(async () => {
      [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === 'Weeks')!.click();
      const seen = new Set<string>();
      const look = () => document.querySelector<HTMLElement>('[data-copy="page"]')?.firstElementChild as HTMLElement | undefined;
      while (!look()) await new Promise(requestAnimationFrame);
      for (let el = look(); el; el = look()) {
        seen.add(el.style.filter);
        await new Promise(requestAnimationFrame);
      }
      return [...seen];
    });
    expect(filters).toEqual(['url("#motion-wash")']);
  });

  test('two presses in a row leave one copy', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/work', { waitUntil: 'networkidle' });
    // How long the second one lasts: the first press's wave, stopped, doesn't end it.
    const lasted = await page.evaluate(async () => {
      for (const name of ['Weeks', 'Spend']) {
        [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === name)!.click();
        await new Promise((done) => setTimeout(done, 100));
      }
      const start = performance.now();
      while (document.querySelector('[data-copy="page"]')) await new Promise(requestAnimationFrame);
      return performance.now() - start;
    });
    expect(lasted).toBeGreaterThan(750);
    await expect(page.getByRole('heading', { level: 1, name: 'Spend' })).toBeVisible();
    expect(await added(page)).toMatchObject({ copies: 2, most: 1 });
  });

  test('Back washes and returns to where the list was scrolled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 300 });
    await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.getByRole('main').getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(0);
    await last.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeHidden();
    await expect(copy(page)).toHaveCount(0);
    await page.goBack();
    await expect(copy(page)).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrolled);
    await expect(copy(page)).toHaveCount(0);
  });

  test('a press from a scrolled page keeps its copy until the front is done', async ({ page }) => {
    await page.goto('/steps', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const top = await page.getByRole('main').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(0);
    await rail(page).getByRole('link', { name: 'Weeks' }).click();
    await expect(copy(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await copy(page).evaluate((el) => el.firstElementChild!.getBoundingClientRect().top)).toBe(top);
    await expect(copy(page)).toHaveCount(0);
  });

  test("run to run never shows the old run's title", async ({ page }) => {
    await page.goto('/runs/97d6367dec7d9739', { waitUntil: 'networkidle' });
    const main = page.getByRole('main');
    const old = 'Queue edits offline and replay them on reconnect';
    await expect(main.getByRole('heading', { level: 1, name: old })).toBeVisible();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/runs/51120289e82db399', async (route) => {
      await held;
      await route.continue();
    });
    await main.getByRole('link', { name: 'Plan run' }).click();
    await expect(main.getByText('Loading the run…')).toBeVisible();
    await expect(main.getByText(old)).toHaveCount(0);
    release();
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(main.getByRole('heading', { level: 1, name: old })).toHaveCount(0);
  });

  test.describe('showing mode', () => {
    test.afterEach(async ({ request }) => {
      const response = await request.post('/api/showing', { data: { projects: [] }, headers: { 'X-Dashboard-Refresh': '1' } });
      expect(response.status()).toBe(204);
    });

    test('showing mode makes no copy and hides at once', async ({ page }) => {
      await watchAdded(page);
      await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
      await page.getByRole('switch', { name: 'Showing mode' }).click();
      const dialog = page.getByRole('dialog', { name: 'Show which projects in full?' });
      await dialog.getByRole('checkbox', { name: 'lantern-notes' }).check();
      await dialog.getByRole('button', { name: 'Start showing' }).click();
      await expect(page.getByRole('complementary').getByText('Showing: lantern-notes')).toBeVisible();
      await expect(page.getByText(/in other projects, counted in totals and charts only/)).toBeVisible();
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('tidepool-api');
      expect(await added(page)).toMatchObject({ copies: 0, canvases: 0 });
    });
  });

  test('a query change and a press to the page already shown make no copy', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/work', { waitUntil: 'networkidle' });
    await page.getByRole('main').getByRole('button', { name: 'Runs' }).click();
    await expect(page).toHaveURL(/view=runs$/);
    await rail(page).getByRole('link', { name: 'Work' }).click();
    await expect(page).toHaveURL(/\/work$/);
    await rail(page).getByRole('link', { name: 'Work' }).click();
    await expect(page.getByRole('main').getByRole('button', { name: 'Runs' })).toBeVisible();
    expect(await added(page)).toEqual({ copies: 0, canvases: 0, most: 0 });
  });

  test('at 375 px there is no copy', async ({ page }) => {
    await watchAdded(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/spend', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog', { name: 'Pages' }).getByRole('link', { name: 'Work' }).click();
    await expect.poll(async () => (await added(page)).canvases).toBe(1);
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await sideways()).toBe(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
    await rested(page);
    expect(await sideways()).toBe(0);
    expect(await added(page)).toEqual({ copies: 0, canvases: 1, most: 0 });
  });

  test('what a page adds during its wave condenses too, and what it adds after it does not', async ({ page }) => {
    const weeks = async (late: boolean) => {
      await page.goto('/work', { waitUntil: 'networkidle' });
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/weeks*', async (route) => {
        await held;
        await route.continue();
      });
      await rail(page).getByRole('link', { name: 'Weeks' }).click();
      await expect(copy(page)).toHaveCount(1);
      if (late) await rested(page);
      release();
      const table = page.getByRole('region', { name: 'By week table', exact: true });
      await expect(table).toBeAttached();
      const moving = await table.evaluate((el) => document.getAnimations().some((a) => a.id === 'condense' && (a.effect as KeyframeEffect).target!.contains(el)));
      await page.unroute('**/api/weeks*');
      return moving;
    };
    expect([await weeks(false), await weeks(true)]).toEqual([true, false]);
  });

  test("Home reached by a press has its first load's edges", async ({ page }) => {
    const edges = () => page.locator('.react-flow__edge-path').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
    await page.goto('/', { waitUntil: 'networkidle' });
    const first = await edges();
    expect(first.length).toBeGreaterThan(0);
    // Its data not yet here, so its panels come after its loading state, then cached, so they come with the page.
    await page.goto('/weeks', { waitUntil: 'networkidle' });
    for (const back of [false, true]) {
      if (back) await rail(page).getByRole('link', { name: 'Weeks' }).click();
      await rested(page);
      await rail(page).getByRole('link', { name: 'Home' }).click();
      await expect(page.locator('.react-flow__edge-path')).toHaveCount(first.length);
      await rested(page);
      expect(await edges()).toEqual(first);
    }
  });

  test('with no WebGL2 nothing is logged', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return kind === 'webgl2' ? null : (getContext as (...args: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof getContext;
    });
    await page.goto('/work', { waitUntil: 'networkidle' });
    await rail(page).getByRole('link', { name: 'Weeks' }).click();
    await expect(copy(page)).toHaveCount(1);
    await expect(page.locator('canvas[data-water]')).toHaveCount(0);
    await rested(page);
    expect(errors).toEqual([]);
  });

  test('no page scrolls or grows through its wash', async ({ page }) => {
    await page.goto('/weeks', { waitUntil: 'networkidle' });
    await rail(page).getByRole('link', { name: 'Home' }).click();
    await expect(page.locator('.react-flow__edge-path').first()).toBeAttached();
    await page.waitForLoadState('networkidle');
    await rested(page);
    for (const name of ['Weeks', 'Home']) {
      const { sizes, rest } = await page.evaluate(async (name) => {
        const size = () => {
          const { scrollWidth, clientWidth, scrollHeight } = document.documentElement;
          return { sideways: scrollWidth - clientWidth, height: scrollHeight, overflow: getComputedStyle(document.getElementById('root')!).overflow };
        };
        [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === name)!.click();
        while (!document.querySelector('[data-copy="page"]')) await new Promise(requestAnimationFrame);
        const sizes = [];
        while (document.getAnimations().some((a) => a.id === 'condense')) {
          sizes.push(size());
          await new Promise(requestAnimationFrame);
        }
        return { sizes, rest: size() };
      }, name);
      expect(sizes.length).toBeGreaterThan(20);
      expect(Math.max(...sizes.map((s) => s.sideways))).toBe(0);
      expect(Math.max(...sizes.map((s) => s.height))).toBeLessThanOrEqual(rest.height);
      // Nothing in flight can overflow the page, and nothing stays clipped.
      expect([...new Set(sizes.map((s) => s.overflow))]).toEqual(['clip']);
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('root')!).overflow)).toBe('visible');
    }
  });

  test('once the page is idle the filters and the shader run unseen, and leave nothing', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/weeks', { waitUntil: 'commit' });
    const unseen = await page.evaluate(async () => {
      const look = () => [document.querySelector<HTMLElement>('[data-copy="prepare"]'), document.querySelector('canvas[data-water="prepare"]')] as const;
      while (look().includes(null)) await new Promise(requestAnimationFrame);
      const [layer] = look();
      return [getComputedStyle(layer!).opacity, (layer!.firstElementChild as HTMLElement).style.filter];
    });
    expect(unseen).toEqual(['0.01', 'url("#motion-wash")']);
    await expect(page.locator('[data-copy], canvas')).toHaveCount(0);
    expect(await added(page)).toEqual({ copies: 0, canvases: 0, most: 0 });
  });

  test("the focus goes to the new page's title", async ({ page }) => {
    await page.goto('/work', { waitUntil: 'networkidle' });
    const focused = await page.evaluate(async () => {
      [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === 'Weeks')!.click();
      while (!document.querySelector('[data-copy="page"]')) await new Promise(requestAnimationFrame);
      return [document.activeElement!.tagName, document.activeElement!.textContent];
    });
    expect(focused).toEqual(['H1', 'Weeks']);
  });
});
