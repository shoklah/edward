import { createElement, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'vitest';
import { eachFrame, motionOn, played } from '../test/motion.ts';
import { flow, useFlow } from './flow.ts';
import { CALM, SOFT } from './play.ts';

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

  test('no row passes its end in any frame, where the rows\' heights are no whole pixels', async () => {
    const on = motionOn();
    const draw = list(['a', 'b', 'c'], 39.5);
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
