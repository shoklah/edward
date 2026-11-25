import { afterEach, expect, test } from 'vitest';
import { motionOn, played } from '../test/motion.ts';
import { flow } from './flow.ts';
import { SOFT } from './play.ts';

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
