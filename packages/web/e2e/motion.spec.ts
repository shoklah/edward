import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { pinClock } from './fixed-time.ts';
import { added, answerEdited, frames, hold, landImport, playing, takePlayed, watchAdded, watchPlayed, type Played } from './motion.ts';
import { settled } from './settled.ts';
import { startShowing, stopShowing } from './showing.ts';

// The one spec with motion on: the others run under reduced motion (`playwright.config.ts`), as its last describe does.

const FULL_TITLE = 'Queue edits offline and replay them on reconnect';
const NOTHING = 'Nothing new. Finished runs and new warnings show here until you mark them seen.';
const rail = (page: Page) => page.getByRole('complementary').getByRole('navigation', { name: 'Main' });
const flow = (page: Page) => page.getByRole('group', { name: "The run's flow" });
/** Home's count of this week's runs on the Full path. */
const fullRuns = (page: Page) => page.locator('table[aria-label="Runs"] tr', { hasText: 'Full' }).locator('td').first();
const moreRuns = (home: any) => { home.thisWeek.runs.full += 3; };
const newWarning = (home: any) => { home.feed.unshift({ ...home.feed.find((item: any) => item.type === 'warning'), text: 'WARN: simplify never ran' }); };
/** Mark all seen is answered here, so the server's own seen time stays. */
const answerSeen = async (page: Page) => {
  await page.route('**/api/seen', (route) => route.fulfill({ status: 204 }));
  await answerEdited(page, '/api/home', (home) => { home.feed = []; });
};

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
      // When each copy came and went, as the page changed, whatever its frames take.
      const came = new Map<Node, number>();
      const lives: number[] = [];
      const watch = new MutationObserver((records) => {
        for (const { addedNodes, removedNodes } of records) {
          for (const node of addedNodes) if ((node as HTMLElement).dataset?.copy === 'page') came.set(node, performance.now());
          for (const node of removedNodes) if (came.has(node)) lives.push(performance.now() - came.get(node)!);
        }
      });
      watch.observe(document.body, { childList: true });
      for (const name of ['Weeks', 'Spend']) {
        [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === name)!.click();
        await new Promise((done) => setTimeout(done, 100));
      }
      while (document.querySelector('h1')?.textContent !== 'Spend' || document.querySelector('[data-copy="page"]')) {
        await new Promise(requestAnimationFrame);
      }
      watch.disconnect();
      return lives.at(-1) ?? 0;
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
    // Scrolled once the page is drawn, however long that takes.
    await expect
      .poll(() => page.evaluate(() => (window.scrollTo(0, document.documentElement.scrollHeight), document.getElementById('main')!.getBoundingClientRect().top)))
      .toBeLessThan(0);
    // Where the page stood, the press, and where its copy stands, in one go, so a slow browser moves nothing in between.
    const { top, scrolled, at } = await page.evaluate(async () => {
      const { top } = document.getElementById('main')!.getBoundingClientRect();
      [...document.querySelectorAll<HTMLElement>('aside nav a')].find((a) => a.textContent === 'Weeks')!.click();
      let layer: Element | null = null;
      while (!(layer = document.querySelector('[data-copy="page"]'))) await new Promise(requestAnimationFrame);
      return { top, scrolled: window.scrollY, at: layer.firstElementChild!.getBoundingClientRect().top };
    });
    expect(top).toBeLessThan(0);
    expect(scrolled).toBe(0);
    expect(at).toBe(top);
    await expect(copy(page)).toHaveCount(0);
  });

  test("run to run never shows the old run's title", async ({ page }) => {
    await page.goto('/runs/97d6367dec7d9739', { waitUntil: 'networkidle' });
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: FULL_TITLE })).toBeVisible();
    const { held, release } = hold();
    await page.route('**/api/runs/51120289e82db399', async (route) => {
      await held;
      await route.continue();
    });
    await main.getByRole('link', { name: 'Plan run' }).click();
    await expect(main.getByText('Loading the run…')).toBeVisible();
    await expect(main.getByText(FULL_TITLE)).toHaveCount(0);
    release();
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(main.getByRole('heading', { level: 1, name: FULL_TITLE })).toHaveCount(0);
  });

  test.describe('showing mode', () => {
    test.afterEach(({ request }) => stopShowing(request));

    test('showing mode makes no copy and hides at once', async ({ page }) => {
      await watchAdded(page);
      await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
      await startShowing(page);
      await expect(page.getByRole('complementary').getByText('Showing: lantern-notes')).toBeVisible();
      await expect(page.getByText(/in other projects, counted in totals and charts only/)).toBeVisible();
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
    // What condenses, kept as it starts, so one a slow browser has already ended still counts.
    await page.addInitScript(() => {
      const kept: Element[] = ((window as unknown as { condensed: Element[] }).condensed = []);
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, frames, options) {
        if ((options as KeyframeAnimationOptions).id === 'condense') kept.push(this);
        return animate.call(this, frames, options);
      };
    });
    const weeks = async (late: boolean) => {
      await page.goto('/work', { waitUntil: 'networkidle' });
      // Early, the page's data comes as soon as the server answers, inside the wave; late, once the wave is done.
      const { held, release } = hold();
      if (late) {
        await page.route('**/api/weeks*', async (route) => {
          await held;
          await route.continue();
        });
      }
      await rail(page).getByRole('link', { name: 'Weeks' }).click();
      await expect(copy(page)).toHaveCount(1);
      if (late) await rested(page);
      release();
      const table = page.getByRole('region', { name: 'By week table', exact: true });
      await expect(table).toBeAttached();
      const moving = await table.evaluate((el) => (window as unknown as { condensed: Element[] }).condensed.some((block) => block.contains(el)));
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
      // Read through the wash: a few frames at least, as many as a machine with no GPU draws (CI).
      expect(sizes.length).toBeGreaterThan(3);
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

test.describe('a run', () => {
  const FULL_RUN = '/runs/97d6367dec7d9739';
  test.beforeEach(({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  const title = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1, name: FULL_TITLE });
  const rested = (page: Page) => expect.poll(() => playing(page)).toEqual([]);

  const drawn = (all: Played[]) => all.filter((a) => a.inFlow && !a.ring);

  test('a run opened by its link: the title travels, then the graph draws itself', async ({ page }) => {
    await watchPlayed(page);
    await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: FULL_TITLE }).click();
    await expect(page.getByRole('heading', { level: 1, name: FULL_TITLE })).toBeVisible();
    // The graph starts in the frame after its page.
    await frames(page);
    const all = await takePlayed(page);
    expect(all.filter((a) => a.tag === 'H1')).toMatchObject([{ verb: 'flow', ms: 620 }]);
    const graph = drawn(all);
    expect(graph.filter((a) => a.tag === 'BUTTON').every((a) => a.verb === 'condense' && a.ms === 180)).toBe(true);
    const delays = graph.filter((a) => a.verb === 'condense').map((a) => a.delay);
    expect(Math.max(...delays) - Math.min(...delays)).toBeCloseTo(900, 0);
    expect(graph.some((a) => a.tag === 'path' && a.verb === 'flow' && a.ms === 260)).toBe(true);
    await rested(page);
  });

  test("the title travels from its link's place and size, and the graph waits for its panel to be opaque", async ({ page }) => {
    // Every animation kept, so one a slow browser has already ended can still be read.
    await page.addInitScript(() => {
      const kept: Animation[] = ((window as unknown as { kept: Animation[] }).kept = []);
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, frames, options) {
        const animation = animate.call(this, frames, options);
        kept.push(animation);
        return animation;
      };
    });
    await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
    const link = page.getByRole('link', { name: FULL_TITLE });
    const at = (await link.boundingBox())!;
    const size = await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await link.click();
    await expect(title(page)).toBeVisible();
    await frames(page);
    const { start, panel, first } = await page.evaluate(async () => {
      const kept = (window as unknown as { kept: Animation[] }).kept;
      const of = (el: Element) => kept.findLast((a) => a.id && (a.effect as KeyframeEffect).target === el)!;
      const begins = async (a: Animation) => {
        await a.ready;
        const delay = a.effect!.getTiming().delay!;
        return { delay, at: (a.startTime as number) + delay };
      };
      const start = (of(document.querySelector('#main h1')!).effect as KeyframeEffect).getKeyframes()[0].transform as string;
      const flow = document.querySelector('[aria-label="The run\'s flow"]')!;
      const item = flow.firstElementChild!.querySelector(':scope > :not(svg)')!;
      return { start, panel: await begins(of(flow.closest('.glass')!)), first: await begins(of(item)) };
    });
    // The graph waits no longer than it has to, though a busy browser may start it some frames later.
    expect(first.at - panel.at).toBeGreaterThan(180);
    expect(first.delay - panel.delay).toBeLessThanOrEqual(190);
    await rested(page);
    const to = (await title(page).boundingBox())!;
    const its = await title(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const [x, y, scale] = start.match(/-?[\d.]+/g)!.map(Number);
    expect(x).toBeCloseTo(at.x - to.x, 0);
    expect(y).toBeCloseTo(at.y - to.y, 0);
    expect(scale).toBeCloseTo(size / its, 2);
  });

  test("on a first load, a resize and a return to a box the graph doesn't draw", async ({ page }) => {
    await watchPlayed(page);
    await page.goto(FULL_RUN, { waitUntil: 'networkidle' });
    await expect(flow(page)).toBeVisible();
    await frames(page);
    expect(await takePlayed(page)).toEqual([]);
    await page.setViewportSize({ width: 1000, height: 900 });
    await frames(page);
    expect(await takePlayed(page)).toEqual([]);
    const boxes = [/^Task 1(?!\d)/, /^Task 2(?!\d)/, /^Task 1(?!\d)/].map((name) => flow(page).getByRole('button', { name }));
    for (const box of boxes) {
      await box.click();
      await expect(box).toHaveAttribute('aria-pressed', 'true');
      await frames(page);
    }
    const all = await takePlayed(page);
    expect(drawn(all)).toEqual([]);
    expect(all.filter((a) => a.ring)).toMatchObject([{ verb: 'flow', ms: 420 }, { verb: 'flow', ms: 420 }]);
    expect(all.filter((a) => a.tag === 'SECTION')).toMatchObject([{ verb: 'condense', ms: 420 }, { verb: 'condense', ms: 420 }, { verb: 'condense', ms: 420 }]);
  });

  test.describe('showing mode', () => {
    test.afterEach(({ request }) => stopShowing(request));

    test("a run reached by a press, with a step selected, doesn't move again when showing mode starts or stops", async ({ page }) => {
      await watchPlayed(page);
      await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
      await page.getByRole('link', { name: FULL_TITLE }).click();
      await expect(flow(page)).toBeVisible();
      await rested(page);
      expect(drawn(await takePlayed(page)).length).toBeGreaterThan(20);
      const box = flow(page).getByRole('button', { name: /^Task 1(?!\d)/ });
      const detail = page.getByRole('region', { name: 'Task 1', exact: true });
      await box.click();
      await expect(detail).toBeVisible();
      await rested(page);
      await takePlayed(page);
      /** The graph and the selected step's detail are drawn again by what `change` does, and nothing moves. */
      const still = async (change: () => Promise<void>) => {
        // Marked, so what is drawn after the reset is told from what was.
        for (const el of [flow(page), detail]) await el.evaluate((e) => e.setAttribute('data-before', ''));
        await change();
        for (const el of [flow(page), detail]) {
          await expect(el).toBeVisible();
          await expect(el).not.toHaveAttribute('data-before');
        }
        await frames(page);
        expect(await takePlayed(page)).toEqual([]);
      };
      await still(async () => {
        await startShowing(page);
      });
      await still(() => page.getByRole('complementary').getByRole('button', { name: 'Stop showing' }).click());
    });

    test("a run hidden while showing doesn't draw its graph when showing mode stops", async ({ page, request }) => {
      // The kept list outlives the test's showing mode, so it is put back as it was.
      const { projects } = await (await request.get('/api/showing')).json();
      const kept = projects.filter((p: { picked: boolean }) => p.picked).map((p: { key: string }) => p.key);
      try {
        await watchPlayed(page);
        await page.goto(FULL_RUN, { waitUntil: 'networkidle' });
        await page.getByRole('complementary').getByRole('link', { name: 'Weeks' }).click();
        await expect(title(page)).toHaveCount(0);
        await rested(page);
        // Showing another project than the run's, which hides it.
        await page.getByRole('complementary').getByRole('switch', { name: 'Showing mode' }).click();
        const dialog = page.getByRole('dialog', { name: 'Show which projects in full?' });
        await dialog.getByRole('checkbox', { name: 'lantern-notes' }).uncheck();
        await dialog.getByRole('checkbox', { name: 'tidepool-api' }).check();
        await dialog.getByRole('button', { name: 'Start showing' }).click();
        await expect(dialog).toHaveCount(0);
        await page.goBack();
        await expect(page.getByText('No run with this key.')).toBeVisible();
        await rested(page);
        await takePlayed(page);
        await page.getByRole('complementary').getByRole('button', { name: 'Stop showing' }).click();
        await expect(flow(page)).toBeVisible();
        await frames(page);
        expect(drawn(await takePlayed(page))).toEqual([]);
      } finally {
        const response = await request.post('/api/showing/projects', { data: { projects: kept }, headers: { 'X-Dashboard-Refresh': '1' } });
        expect(response.status()).toBe(204);
      }
    });
  });

  test("Back to a run draws its graph, its title doesn't travel", async ({ page }) => {
    await watchPlayed(page);
    await page.goto(FULL_RUN, { waitUntil: 'networkidle' });
    await page.getByRole('complementary').getByRole('link', { name: 'Weeks' }).click();
    await expect(title(page)).toHaveCount(0);
    await rested(page);
    await takePlayed(page);
    await page.goBack();
    await expect(flow(page)).toBeVisible();
    await rested(page);
    const all = await takePlayed(page);
    expect(drawn(all).some((a) => a.tag === 'BUTTON' && a.verb === 'condense')).toBe(true);
    expect(all.filter((a) => a.tag === 'H1')).toMatchObject([{ verb: 'condense', ms: 640 }]);
  });

  test("a run opened from Home's feed, on the right, doesn't make the page scroll while its title travels", async ({ page }) => {
    await watchPlayed(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const link = page.getByRole('region', { name: 'Since you last looked', exact: true }).locator('a[href^="/runs/"]').first();
    expect((await link.boundingBox())!.x).toBeGreaterThan(900);
    const sideways = await link.evaluate(async (el: HTMLElement) => {
      el.click();
      while (!document.querySelector('[data-copy="page"]')) await new Promise(requestAnimationFrame);
      const sideways = [];
      while (document.getAnimations().some((a) => a.id)) {
        sideways.push(document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await new Promise(requestAnimationFrame);
      }
      return sideways;
    });
    // A few frames at least, as many as a machine with no GPU draws (CI).
    expect(sideways.length).toBeGreaterThan(3);
    expect(Math.max(...sideways)).toBe(0);
    expect((await takePlayed(page)).filter((a) => a.tag === 'H1')).toMatchObject([{ verb: 'flow', ms: 620 }]);
  });

  test("a run's data that comes after the wave draws the graph and leaves the title still", async ({ page }) => {
    await watchPlayed(page);
    await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
    await page.route('**/api/runs/*', async (route) => {
      await new Promise((done) => setTimeout(done, 1200));
      await route.continue();
    });
    await page.getByRole('link', { name: FULL_TITLE }).click();
    await expect(flow(page)).toBeVisible();
    await rested(page);
    const all = await takePlayed(page);
    const boxes = drawn(all);
    expect(boxes.some((a) => a.tag === 'BUTTON' && a.verb === 'condense')).toBe(true);
    expect(Math.min(...boxes.map((a) => a.delay))).toBe(0);
    expect(all.filter((a) => a.tag === 'H1')).toEqual([]);
  });
});

test.describe('an import', () => {
  test.beforeEach(({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  const drops = (page: Page) => page.locator('[data-drop]');
  const filter = (page: Page) => page.locator('#main').evaluate((el) => el.style.filter);

  test('an import with a change in the window starts the wave', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, { '/api/home': moreRuns });
    await expect(page.locator('[data-drop="drop"]')).toHaveCount(2); // Full and All paths
    expect(await filter(page)).toContain('motion-bend');
    expect((await playing(page)).filter((a) => a.verb === 'ripple').map((a) => a.ms)).toContain(1200);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => filter(page)).toBe('');
    await expect(drops(page)).toHaveCount(0, { timeout: 8000 });
  });

  test('a new feed item lands as a drop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, { '/api/home': newWarning });
    await expect(page.locator('li', { hasText: 'Simplify never ran' })).toBeAttached();
    const landed = () =>
      page.evaluate(() =>
        document.getAnimations().filter((a) => a.id === 'ripple' && (a.effect as KeyframeEffect).target!.matches('li')).map((a) => a.effect!.getTiming().duration));
    expect(await landed()).toEqual([680]);
    await expect.poll(landed).toEqual([]);
  });

  test('an import that changes nothing plays the small ripple', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, {});
    await expect.poll(async () => (await added(page)).canvases).toBe(1);
    await expect(drops(page)).toHaveCount(0);
    expect(await filter(page)).toBe('');
    expect((await playing(page)).map((a) => a.ms)).not.toContain(1200);
  });

  test('a landing of /api/showing alone starts neither', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const { held, release } = hold();
    await page.route('**/api/home', async (route) => {
      await held;
      await route.continue();
    });
    const showing = page.waitForResponse('**/api/showing');
    await landImport(page, {});
    await (await showing).finished();
    await page.waitForTimeout(300);
    expect(await added(page)).toMatchObject({ canvases: 0 });
    release();
    await expect.poll(async () => (await added(page)).canvases).toBe(1);
    expect(await filter(page)).toBe('');
    expect((await playing(page)).map((a) => a.ms)).not.toContain(1200);
  });

  test('with a dialog open the new numbers show at once, with the small ripple', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const full = fullRuns(page);
    const was = Number(await full.textContent());
    const { held, release } = hold();
    await landImport(page, { '/api/home': moreRuns }, held);
    await page.getByRole('complementary').getByRole('switch', { name: 'Showing mode' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    release();
    await expect(full).toHaveText(String(was + 3));
    await expect(drops(page)).toHaveCount(0);
    await expect.poll(async () => (await added(page)).canvases).toBe(1);
    expect(await filter(page)).toBe('');
  });

  test('the eye blinks on any import', async ({ page }) => {
    // What the eye plays, as it starts, so a slow browser's frames miss none.
    await page.addInitScript(() => {
      const blinks: [string, unknown][] = ((window as unknown as { blinks: [string, unknown][] }).blinks = []);
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, frames, options) {
        const { id, duration } = options as KeyframeAnimationOptions;
        if (this.matches('a[aria-label="edward, Home"] svg')) blinks.push([id!, duration]);
        return animate.call(this, frames, options);
      };
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, {});
    await expect.poll(() => page.evaluate(() => (window as unknown as { blinks: unknown[] }).blinks)).toContainEqual(['ripple', 260]);
  });

  test('preparing never ends the bend of an import under way', async ({ page }) => {
    // The browser is idle only once the test says so.
    await page.addInitScript(() => {
      const waiting = new Map<number, () => void>();
      let next = 0;
      window.requestIdleCallback = (run) => {
        waiting.set(++next, run as () => void);
        return next;
      };
      window.cancelIdleCallback = (id) => void waiting.delete(id);
      (window as unknown as { idle: () => void }).idle = () => {
        for (const run of waiting.values()) run();
        waiting.clear();
      };
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, { '/api/home': moreRuns });
    await expect(page.locator('[data-drop="drop"]')).toHaveCount(2);
    const during = await page.evaluate(() => {
      (window as unknown as { idle: () => void }).idle();
      return [document.getElementById('main')!.style.filter, document.querySelectorAll('[data-copy]').length];
    });
    expect(during).toEqual(['url("#motion-bend")', 0]);
  });

  test('nothing scrolls or grows through its wave', async ({ page }) => {
    // On a wide window a panel's bob is larger than the space beside it.
    for (const [path, width] of [['/', 1440], ['/weeks', 1440], ['/', 3440], ['/weeks', 3440]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'networkidle' });
      const size = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      const rest = await size();
      expect(rest[0]).toBe(width);
      const sizes = page.evaluate(async () => {
        const bobs = () => document.getAnimations().filter((a) => a.id === 'ripple' && a.effect!.getTiming().duration === 1200);
        while (bobs().length === 0) await new Promise(requestAnimationFrame);
        const seen = new Set<string>();
        // Stepped, all at once, since a browser's own frames can miss a bob's farthest, early on.
        // Kept: one stepped past its end is no longer listed.
        const all = bobs();
        for (const bob of all) bob.pause();
        for (let ms = 0; ms <= 1200; ms += ms < 200 ? 1 : 20) {
          for (const bob of all) bob.currentTime = bob.effect!.getTiming().delay! + ms;
          seen.add(JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight]));
        }
        for (const bob of all) bob.finish();
        return [...seen].map((s) => JSON.parse(s));
      });
      await landImport(page, { '/api/home': moreRuns, '/api/weeks': (weeks) => { for (const w of weeks.weeks) w.laterFixes += 1; } });
      expect(await sizes, `${path} at ${width} px`).toEqual([rest]);
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('root')!).overflow)).toBe('visible');
      await page.unrouteAll();
    }
  });
});

test.describe('Mark all seen', () => {
  test.beforeEach(({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  const mark = (page: Page) => page.getByRole('button', { name: 'Mark all seen' });
  const items = (page: Page) => page.getByRole('region', { name: 'Since you last looked list' }).getByRole('listitem');

  test('washes the items away over the list that is gone, and nothing scrolls', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await answerSeen(page);
    const left = page.evaluate(async () => {
      const root = document.documentElement;
      const region = document.querySelector('[data-scroll-cue="block"]')!.getBoundingClientRect().toJSON();
      const shown = [...document.querySelectorAll('[data-scroll-cue="block"] li')].filter((el) => el.getBoundingClientRect().top < region.bottom).length;
      const size = () => [root.scrollWidth, root.scrollHeight].join();
      const sizes = new Set([size()]);
      let layer: HTMLElement | null = null;
      while (!layer) {
        await new Promise(requestAnimationFrame);
        layer = document.querySelector('[data-copy="items"]');
      }
      const all = layer.getAnimations({ subtree: true });
      for (const animation of all) animation.pause();
      const end = Math.max(...all.map((a) => a.effect!.getComputedTiming().endTime as number));
      for (let ms = 0; ms < end; ms += 10) {
        for (const animation of all) animation.currentTime = ms;
        sizes.add(size());
      }
      const found = {
        region: JSON.stringify(layer.getBoundingClientRect().toJSON()) === JSON.stringify(region),
        all: all.length === shown && layer.childElementCount === shown,
        washes: all.every((a) => a.id === 'wash'),
        sizes: sizes.size,
      };
      for (const animation of all) animation.finish();
      return found;
    });
    await expect(items(page).first()).toBeVisible();
    await mark(page).click();
    expect(await left).toEqual({ region: true, all: true, washes: true, sizes: 1 });
    await expect(page.getByText(NOTHING)).toBeVisible();
    await expect(page.locator('[data-copy]')).toHaveCount(0);
    await settled(page.getByRole('main'));
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('with a failing POST leaves the list and no copy', async ({ page }) => {
    await watchAdded(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const count = await items(page).count();
    expect(count).toBeGreaterThan(0);
    await page.route('**/api/seen', (route) => route.fulfill({ status: 500 }));
    const answered = page.waitForResponse('**/api/seen');
    await mark(page).click();
    await (await answered).finished();
    await expect(items(page)).toHaveCount(count);
    await page.waitForTimeout(100);
    // Nor is the press still waiting for the next change of the list.
    await landImport(page, { '/api/home': (home) => (home.feed = []) });
    await expect(page.getByText(NOTHING)).toBeAttached();
    expect(await added(page)).toMatchObject({ copies: 0 });
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

  test('under reduced motion every moment changes at once', async ({ page }) => {
    await watchAdded(page);
    await watchPlayed(page);
    const main = page.getByRole('main');
    /** The moment just seen to change the page played nothing and left nothing. */
    const still = async (moment: string) => {
      await frames(page);
      expect(await takePlayed(page), moment).toEqual([]);
      expect(await added(page), moment).toMatchObject({ copies: 0, canvases: 0 });
      // Only the scroll cue is an animation, on its scroll.
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline && a.playState === 'running').length), moment).toBe(0);
    };

    await page.goto('/work?view=runs', { waitUntil: 'networkidle' });
    await rail(page).getByRole('link', { name: 'Weeks' }).click();
    await expect(main.getByRole('heading', { level: 1, name: 'Weeks' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'By week table', exact: true })).toBeVisible();
    await still('a rail press');

    await page.goBack();
    await expect(main.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
    await still('Back');

    await main.getByRole('link', { name: FULL_TITLE }).click();
    await expect(main.getByRole('heading', { level: 1, name: FULL_TITLE })).toBeVisible();
    await expect(flow(page).getByRole('button').first()).toBeVisible();
    await still('a run opened by its link');

    for (const task of ['Task 1', 'Task 2']) {
      await flow(page).getByRole('button', { name: new RegExp(`^${task}(?!\\d)`) }).click();
      await expect(page.getByRole('region', { name: task, exact: true })).toBeVisible();
      await expect(flow(page).locator('[data-ring]')).toHaveCount(1);
      await still(`${task}'s box selected`);
    }
    await expect(page.getByRole('region', { name: 'Task 1', exact: true })).toHaveCount(0);

    await page.goBack();
    await main.getByRole('button', { name: 'Details of Send webhooks for note changes' }).click();
    await expect(main.getByRole('definition').filter({ hasText: /^feature\/webhooks$/ })).toBeVisible();
    await still('a row opened');

    const names = () => main.locator('a[href^="/runs/"]').allTextContents();
    const listed = await names();
    await main.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(main.getByRole('columnheader', { name: 'Run', exact: true })).toHaveAttribute('aria-sort', 'ascending');
    expect(await names()).not.toEqual(listed);
    await still('a column sorted');

    await rail(page).getByRole('link', { name: 'Home' }).click();
    const full = fullRuns(page);
    await expect(full).toBeVisible();
    const was = Number(await full.textContent());
    await landImport(page, { '/api/home': moreRuns });
    await expect(full).toHaveText(String(was + 3));
    await still('an import with a change');

    // Loaded again, since an import lands once.
    await page.unrouteAll();
    await page.goto('/', { waitUntil: 'networkidle' });
    await landImport(page, { '/api/home': newWarning });
    await expect(page.locator('li', { hasText: 'Simplify never ran' })).toBeVisible();
    await still('an import adding a feed item');

    await answerSeen(page);
    await page.getByRole('button', { name: 'Mark all seen' }).click();
    await expect(page.getByText(NOTHING)).toBeVisible();
    await still('Mark all seen');
  });
});
