import { createElement, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eachFrame, finish, fits, motionOn, played } from '../test/motion.ts';
import { flow, useFlow } from './flow.ts';
import { CALM, SOFT } from './play.ts';
import { useLanding, useRipple } from './ripple.ts';

afterEach(() => document.body.replaceChildren());

function box(): HTMLElement {
  const el = document.body.appendChild(document.createElement('div'));
  el.style.cssText = 'width: 200px; height: 40px';
  return el;
}

test('what flows stretches over the gap from its last place, then gathers where it is', () => {
  const el = box();
  flow(el, { x: 0, y: -80 });
  expect(played(document.body)).toEqual([]);
  const on = motionOn();
  flow(el, { x: 0, y: -80 });
  expect(played(document.body)).toEqual([{ verb: 'flow', ms: 420, el }]);
  const effect = el.getAnimations()[0].effect as KeyframeEffect;
  expect(effect.getTiming().easing).toBe('ease-in');
  expect(effect.getKeyframes().map(({ computedOffset, transform }) => [computedOffset, transform])).toEqual([
    [0, 'translate(0px, -80px)'],
    [0.3, 'translate(0px, -40px) scale(0.9, 2.1)'],
    [1, 'none'],
  ]);
  // As the browser writes it.
  expect(effect.getKeyframes()[1].easing).toBe(new KeyframeEffect(null, [], { easing: SOFT }).getTiming().easing);
  on.mockRestore();
});

test('it stretches sideways too, over a long gap no more than over 200 px across and 160 down', () => {
  const on = motionOn();
  const middle = (from: { x: number; y: number }) => {
    const el = box();
    flow(el, from);
    return (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[1].transform;
  };
  expect(middle({ x: 400, y: 0 })).toBe('translate(200px, 0px) scale(1.5, 0.9)');
  expect(middle({ x: 400, y: 320 })).toBe('translate(200px, 160px) scale(1.5, 3.2)');
  on.mockRestore();
});

test('what holds it is clipped until it ends, also when it is cut short', async () => {
  const on = motionOn();
  const [holder, el] = [box(), box()];
  flow(el, { x: 80, y: 0 }, holder);
  expect(holder.style.overflow).toBe('clip');
  el.getAnimations()[0].cancel();
  await vi.waitFor(() => expect(holder.style.overflow).toBe(''));
  on.mockRestore();
});

test('what has not moved does not flow', () => {
  const on = motionOn();
  flow(box(), { x: 0, y: 0 });
  expect(played(document.body)).toEqual([]);
  on.mockRestore();
});

describe('a list', () => {
  let why: ReturnType<typeof useFlow>;
  let unmount = () => {};
  afterEach(() => unmount());

  function List({ keys, last }: { keys: string[]; last: number }) {
    const list = useRef<HTMLUListElement>(null);
    why = useFlow(list, keys);
    const row = (key: string, i: number) => createElement('li', { key, id: key, style: { height: i === keys.length - 1 ? last : 40 } }, createElement('td', null, createElement('div')));
    return createElement('ul', { ref: list, style: { margin: 0, padding: 0, listStyle: 'none' } }, keys.map(row));
  }

  /** A list of rows of 40 px, its last of `last`, in a page of 2000: draws other keys. */
  function list(keys: string[], last = 40): (keys: string[]) => void {
    const page = document.body.appendChild(document.createElement('div'));
    page.style.height = '2000px';
    const root = createRoot(page);
    unmount = () => root.unmount();
    const draw = (next: string[]) => flushSync(() => root.render(createElement(List, { keys: next, last })));
    draw(keys);
    return draw;
  }

  const row = (key: string) => document.getElementById(key)!;
  const effect = (key: string) => row(key).getAnimations()[0].effect as KeyframeEffect;
  const from = (key: string) => effect(key).getKeyframes()[0].transform;
  const delays = (keys: string[]) => keys.map((key) => effect(key).getTiming().delay);

  test.each([0, 300])('sorted, its rows flow from their places to their new ones, with the page scrolled %i px between', (top) => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c']);
    expect(played(document.body)).toEqual([]);
    why('sort');
    window.scrollTo(0, top);
    expect(window.scrollY).toBe(top);
    draw(['c', 'b', 'a']);
    expect(played(document.body)).toEqual([
      { verb: 'flow', ms: 520, el: row('c') },
      { verb: 'flow', ms: 520, el: row('a') },
    ]);
    expect([from('a'), from('c')]).toEqual(['translateY(-80px)', 'translateY(80px)']);
    expect(effect('a').getKeyframes()[1].transform).toBe('none');
    expect(delays(['c', 'a'])).toEqual([0, 18]);
    expect(effect('a').getTiming().easing).toBe(new KeyframeEffect(null, [], { easing: CALM }).getTiming().easing);
    window.scrollTo(0, 0);
    on.mockRestore();
  });

  test('a row starts from its place at the press, where a row grew with no commit', () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c']);
    row('a').style.height = '100px';
    why('sort');
    draw(['c', 'b', 'a']);
    expect(from('c')).toBe('translateY(140px)');
    on.mockRestore();
  });

  test('a row sorted again while it flows starts from the place it was flowing to', () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c']);
    why('sort');
    draw(['c', 'b', 'a']);
    why('sort');
    draw(['a', 'b', 'c']);
    expect(row('a').getAnimations()).toHaveLength(1);
    expect(from('a')).toBe('translateY(80px)');
    on.mockRestore();
  });

  test('its rows follow one another by 18 ms, at most 144', () => {
    const on = motionOn();
    const keys = [...'abcdefghijkl'];
    const draw = list(keys);
    why('sort');
    draw(keys.toReversed());
    expect(delays(keys.toReversed())).toEqual([0, 18, 36, 54, 72, 90, 108, 126, 144, 144, 144, 144]);
    on.mockRestore();
  });

  test('sorted, a row new to it condenses, and one from below its new end starts at that end', () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c', 'd', 'e', 'f']);
    why('sort');
    draw(['f', 'new']);
    expect(played(document.body)).toEqual([
      { verb: 'flow', ms: 520, el: row('f') },
      { verb: 'condense', ms: 520, el: row('new') },
    ]);
    expect(from('f')).toBe('translateY(40px)');
    expect(delays(['f', 'new'])).toEqual([0, 18]);
    on.mockRestore();
  });

  test.each([1, 1.1])('no row passes its end in any frame, where the rows\' heights are no whole pixels, its panel drawn at scale %f', async (scale) => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c'], 39.5);
    document.querySelector('ul')!.parentElement!.style.transform = `scale(${scale})`;
    why('sort');
    draw(['c', 'b', 'a']);
    const ul = document.querySelector('ul')!;
    const bottom = (el: Element) => el.getBoundingClientRect().bottom;
    expect(bottom(row('c'))).toBeCloseTo(bottom(ul), 3);
    await eachFrame(ul, () => {
      for (const key of 'abc') expect(bottom(row(key)) - bottom(ul)).toBeLessThanOrEqual(0.01);
    });
    on.mockRestore();
  });

  test('opened, its new row\'s content condenses and the rows below flow, the last first', () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c']);
    why('open');
    draw(['a', 'a-open', 'b', 'c']);
    expect(played(document.body)).toEqual([
      { verb: 'flow', ms: 460, el: row('b') },
      { verb: 'flow', ms: 460, el: row('c') },
      { verb: 'condense', ms: 480, el: row('a-open').querySelector('div') },
    ]);
    expect(from('b')).toBe('translateY(-40px)');
    expect(delays(['b', 'c'])).toEqual([12, 0]);
    expect((row('a-open').querySelector('div')!.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0].transform).toBe('scale(0.96, 0.6)');
    on.mockRestore();
  });

  test('told it opens with no new row, or not told why, its rows move at once, and what still played ends', () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c']);
    why('open');
    draw(['c', 'b', 'a']);
    expect(played(document.body)).toEqual([]);
    draw(['new', 'a', 'b', 'c']);
    expect(played(document.body)).toEqual([]);
    why('sort');
    draw(['c', 'b', 'a']);
    draw(['c', 'b', 'a']);
    expect(played(document.body)).toHaveLength(3);
    draw(['c', 'a']);
    expect(played(document.body)).toEqual([]);
    on.mockRestore();
  });

  test('with motion off its rows move at once', () => {
    const draw = list(['a', 'b']);
    why('sort');
    draw(['b', 'a']);
    const on = motionOn();
    draw(['a', 'b']);
    expect(played(document.body)).toEqual([]);
    on.mockRestore();
  });
});

describe('a list an import changes', () => {
  type Drawn = { keys: string[]; all?: string[]; value?: number; height?: number; top?: number; row?: 'li' | 'tr'; scale?: number; region?: number };
  let on: { mockRestore(): void };
  let unmount = () => {};
  /** The time of the last import drawn: each is a later one than any test's before. */
  let imports = 0;
  beforeEach(async () => {
    await page.viewport(600, 400);
    on = motionOn();
  });
  afterEach(() => {
    unmount();
    on.mockRestore();
  });

  function Page({ at, keys, all, value = 0, height = 40, top = 0, row = 'li', scale = 1, region }: Drawn & { at: string }) {
    const list = useRef<HTMLElement>(null);
    useFlow(list, keys, all);
    const { ref, children } = useRipple<HTMLElement>(String(value));
    useLanding('/api/list', { lastImportAt: at, lastGoodImportAt: at, error: null, importing: false }, true);
    const cell = createElement('td', { style: { padding: 0 } });
    const rows = keys.map((key) => createElement(row, { key, id: key, style: { height, display: row === 'li' ? 'block' : undefined } }, row === 'tr' && cell));
    const body = createElement(row === 'li' ? 'ul' : 'tbody', { ref: list, style: { margin: 0, padding: 0 } }, rows);
    return createElement(
      'div',
      { style: { paddingTop: top, transform: scale === 1 ? undefined : `scale(${scale})` } },
      createElement('p', { 'data-imported': '' }, 'Imported'),
      createElement('p', { ref }, children),
      createElement('div', { id: 'scroller', 'data-scroll-cue': '', style: { overflow: 'auto', height: region } }, row === 'li' ? body : createElement('table', { style: { width: '100%', borderSpacing: 0 } }, body)),
    );
  }

  /** A list drawn: what draws it again, with the next import's data or not, up to what is painted. */
  async function list(first: Drawn): Promise<(next: Partial<Drawn>, landing?: boolean) => Promise<void>> {
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    unmount = () => root.unmount();
    let drawn = first;
    const draw = async (next: Partial<Drawn>, landing = true) => {
      if (landing) imports += 1;
      drawn = { ...drawn, ...next };
      flushSync(() => root.render(createElement(Page, { ...drawn, at: new Date(imports * 1000).toISOString() })));
      await Promise.resolve();
    };
    await draw({}, false);
    return draw;
  }

  const row = (key: string) => document.getElementById(key)!;
  const body = () => document.querySelector('ul, tbody')!;
  const top = (key: string) => row(key).getBoundingClientRect().top;
  const effect = (key: string) => row(key).getAnimations()[0].effect as KeyframeEffect;
  const start = (key: string) => effect(key).getKeyframes()[0].transform;
  const delay = (key: string) => effect(key).getTiming().delay!;
  const waves = () => played(document.querySelector('[data-imported]')!).length;
  /** No row stands on another. */
  const apart = () => {
    const rects = [...body().children].map((el) => el.getBoundingClientRect());
    for (const [i, { top }] of rects.entries()) if (i > 0) expect(top).toBeGreaterThanOrEqual(rects[i - 1].bottom);
  };

  test('what is new lands when the front is there, the rest flow down, the last first', async () => {
    const draw = await list({ keys: ['a', 'b', 'c'] });
    const was = ['a', 'b', 'c'].map(top);
    await draw({ keys: ['new', 'a', 'b', 'c'] });
    expect(waves()).toBe(1);
    expect(played(body())).toEqual(expect.arrayContaining([
      { verb: 'ripple', ms: 680, el: row('new') },
      ...['a', 'b', 'c'].map((key) => ({ verb: 'flow', ms: 560, el: row(key) })),
    ]));
    expect(played(body())).toHaveLength(4);
    const front = delay('c');
    expect(front).toBeGreaterThan(0);
    // After the first that moves, so it doesn't draw over the old first row.
    expect(delay('new')).toBeCloseTo(front + 150);
    for (const [i, key] of ['c', 'b', 'a'].entries()) expect(delay(key)).toBeCloseTo(front + 16 * i);
    // Until the front is there, in the document, unseen, and the rest at their old places.
    for (const ms of [0, front - 1]) {
      for (const el of body().children) for (const animation of el.getAnimations()) animation.currentTime = ms;
      expect(getComputedStyle(row('new')).opacity).toBe('0');
      expect(['a', 'b', 'c'].map(top)).toEqual(was);
    }
    expect(effect('new').getKeyframes().map(({ computedOffset, opacity, transform, transformOrigin }) => [computedOffset, opacity, transform, transformOrigin])).toEqual([
      [0, '0', 'translateY(-34px) scale(0.5, 1.2)', '0px 0px'],
      [0.18, '1', undefined, undefined],
      [1, '1', 'none', '0px 0px'],
    ]);
    const calm = new KeyframeEffect(null, [], { easing: CALM }).getTiming().easing;
    expect(['new', 'a'].map((key) => effect(key).getTiming().easing)).toEqual([calm, calm]);
    finish(body());
    expect(['new', 'a', 'b', 'c'].map(top)).toEqual([0, 40, 80, 120].map((y) => was[0] + y));
  });

  test('the first row of an empty list lands', async () => {
    const draw = await list({ keys: [] });
    await draw({ keys: ['new'] });
    expect(played(body())).toEqual([{ verb: 'ripple', ms: 680, el: row('new') }]);
    expect(waves()).toBe(1);
  });

  test('with no landing, or drawn for the first time, it is drawn at once', async () => {
    const draw = await list({ keys: ['a'] });
    expect(played(document.body)).toEqual([]);
    await draw({ keys: ['new', 'a'] }, false);
    expect(played(document.body)).toEqual([]);
    await draw({});
    expect(played(document.body)).toEqual([]);
  });

  test('gained below the window, it starts nothing', async () => {
    const draw = await list({ keys: ['a'], height: 900 });
    await draw({ keys: ['a', 'new'] });
    expect(played(document.body)).toEqual([]);
  });

  test('a row it held, brought onto the page, is drawn at once, and in a wave moves no other', async () => {
    const draw = await list({ keys: ['a', 'b', 'c'], all: ['a', 'b', 'c', 'd', 'e'] });
    await draw({ keys: ['b', 'c', 'd'], all: ['b', 'c', 'd', 'e'] });
    expect(played(document.body)).toEqual([]);
    await draw({ keys: ['c', 'd', 'e'], all: ['c', 'd', 'e'], value: 1 });
    expect(waves()).toBe(1);
    expect(played(body())).toEqual([]);
    apart();
    await eachFrame(document.body, apart);
  });

  test('with one brought onto the page, a row new to it still lands, and no other moves', async () => {
    const draw = await list({ keys: ['a', 'b', 'c'], all: ['a', 'b', 'c', 'd'] });
    await draw({ keys: ['new', 'c', 'd'], all: ['new', 'c', 'd'] });
    expect(played(body())).toEqual([{ verb: 'ripple', ms: 680, el: row('new') }]);
  });

  test.each([
    [['b', 'c', 'd'], []],
    [['new', 'c', 'd'], ['new']],
  ])('shorter, in a wave, to %j its rows stay apart: only what is new plays', async (keys, landing) => {
    const draw = await list({ keys: ['a', 'b', 'c', 'd'] });
    await draw({ keys, value: 1 });
    expect(waves()).toBe(1);
    expect(played(body()).map(({ verb, el }) => [verb, el.id])).toEqual(landing.map((key) => ['ripple', key]));
    apart();
    await eachFrame(document.body, apart);
  });

  test('scrolled past its head, where the browser keeps what is read in place, it stays still in a wave', async () => {
    const draw = await list({ keys: ['a', 'b', 'c', 'd', 'e'], region: 100 });
    const scroller = document.getElementById('scroller')!;
    scroller.scrollTop = 30;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const was = top('a');
    await draw({ keys: ['new', 'a', 'b', 'c', 'd', 'e'], value: 1 });
    expect(waves()).toBe(1);
    expect(played(body())).toEqual([]);
    expect(top('a')).toBe(was);
  });

  test('scrolled past its head, a new row in view lands and what is read stays in place', async () => {
    const draw = await list({ keys: ['a', 'b', 'c', 'd', 'e', 'f'], region: 100 });
    document.getElementById('scroller')!.scrollTop = 60;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const was = top('b');
    await draw({ keys: ['n1', 'a', 'b', 'n2', 'c', 'd', 'e', 'f'] });
    expect(played(body()).map(({ verb, el }) => [verb, el.id])).toEqual([['ripple', 'n1'], ['ripple', 'n2']]);
    expect(top('b')).toBe(was);
  });

  test('reordered, it starts no wave, and in one a number starts its rows flow', async () => {
    const draw = await list({ keys: ['a', 'b', 'c'] });
    await draw({ keys: ['c', 'b', 'a'] });
    expect(played(document.body)).toEqual([]);
    await draw({ keys: ['a', 'b', 'c'], value: 1 });
    expect(waves()).toBe(1);
    expect(played(body()).map(({ verb, ms, el }) => [verb, ms, el.id])).toEqual([['flow', 560, 'a'], ['flow', 560, 'c']]);
    expect([start('a'), start('c')]).toEqual(['translateY(80px)', 'translateY(-80px)']);
    expect(delay('a')).toBeCloseTo(delay('c') + 16);
  });

  test.each([
    ['tr', 40, 'translateY(-26px) scale(0.96, 1.3)'],
    ['tr', 200, 'translateY(-60px) scale(0.96, 1.3)'],
    ['li', 300, 'translateY(-60px) scale(0.5, 1.2)'],
  ] as const)('a %s of %i px lands from %s', async (tag, height, from) => {
    const draw = await list({ keys: ['a'], row: tag, height });
    await draw({ keys: ['new', 'a'] });
    expect(start('new')).toBe(from);
    expect(delay('new')).toBeCloseTo(delay('a') + (tag === 'tr' ? 80 : 150));
  });

  test.each([
    ['li', 39.5, 1],
    ['li', 240.25, 1],
    ['li', 240.3, 1.1],
    ['tr', 39.5, 1.1],
    ['tr', 120.25, 1],
  ] as const)('landing, no %s of %f px passes its list\'s end in any frame nor makes it scroll, its panel drawn at scale %f', async (tag, height, scale) => {
    const draw = await list({ keys: ['a', 'b'], row: tag, height, scale });
    // One from its end, and one added there.
    await draw({ keys: ['b', 'new'] });
    expect(played(body()).map(({ verb, el }) => [verb, el.id])).toEqual([['flow', 'b'], ['ripple', 'new']]);
    const bottom = (el: Element) => el.getBoundingClientRect().bottom;
    await eachFrame(body(), () => {
      for (const el of body().children) expect(bottom(el) - bottom(body())).toBeLessThanOrEqual(0.01);
      fits(document.getElementById('scroller')!);
    });
  });

  test('one drop of light falls at its head with what lands, and none once its rows changed again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const light = vi.spyOn(WebGL2RenderingContext.prototype, 'uniform4fv');
    const head = () => {
      const { left, top, width } = body().getBoundingClientRect();
      return { x: left + width / 2, y: top + 30 };
    };
    /** How many drops are drawn at a place once the front is there. */
    const fallen = async ({ x, y }: { x: number; y: number }) => {
      vi.advanceTimersByTime(2000);
      light.mockClear();
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
      expect(light).toHaveBeenCalled();
      const sources = light.mock.lastCall![1] as Float32Array;
      return sources.filter((at, i) => i % 4 === 0 && at === x && sources[i + 1] === y).length;
    };
    const draw = await list({ keys: ['a'], top: 101 });
    await draw({ keys: ['new', 'a'] });
    expect(await fallen(head())).toBe(1);
    await draw({ keys: ['b', 'new', 'a'], top: 153 });
    await draw({ keys: ['a'] }, false);
    expect(played(body())).toEqual([]);
    expect(await fallen(head())).toBe(0);
    // Nor once they changed while motion was off.
    await draw({ keys: ['c', 'a'], top: 205 });
    on.mockRestore();
    await draw({ keys: ['a'] }, false);
    on = motionOn();
    expect(await fallen(head())).toBe(0);
    // Nor once the list is gone.
    await draw({}, false);
    await draw({ keys: ['d', 'a'], top: 257 });
    const at = head();
    unmount();
    expect(await fallen(at)).toBe(0);
    light.mockRestore();
    vi.useRealTimers();
  });
});
