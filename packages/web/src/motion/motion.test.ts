import { expect, test, vi } from 'vitest';
import css from '../index.css?raw';
import { eachFrame, finish, fits, motionOn, played } from '../test/motion.ts';
import { CALM, EASE_OUT, FIRM, JELLY, SOFT, motionRuns, play, spring } from './play.ts';

const sources = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const outside = Object.entries(sources).filter(
  ([path]) => !path.startsWith('./') && !path.startsWith('../components/ui/') && !path.startsWith('../test/') && !/\.(test|stories)\.tsx?$/.test(path),
);

test('nothing outside motion/ animates or carries a transition or animation class, the Refresh spin aside', () => {
  expect(outside.length).toBeGreaterThan(50);
  expect(outside.filter(([, code]) => code.includes('.animate(')).map(([path]) => path)).toEqual([]);
  const classes = outside.flatMap(([path, code]) => [...code.matchAll(/\b(?:transition|animate)-[\w[]+/g)].map(([name]) => `${path} ${name}`));
  expect(classes).toEqual(['../layout/RefreshButton.tsx animate-spin']);
});

test('a spring is a linear() easing from 0 to 1, and FIRM is index.css\'s --spring-firm', () => {
  for (const easing of [spring(0.75), FIRM, SOFT, JELLY, CALM]) {
    const points = easing.match(/^linear\((.*)\)$/)![1].split(',').map(Number);
    expect(points).toHaveLength(41);
    expect([points[0], points.at(-1)]).toEqual([0, 1]);
    if (easing === CALM) expect(Math.max(...points)).toBe(1);
  }
  expect(css).toContain(`--spring-firm: ${FIRM};`);
});

test('motion/ exports its four verbs, its hooks and motionRuns, nothing else', async () => {
  const names = Object.keys(await import('./index.ts'));
  expect(names.filter((n) => !['wash', 'condense', 'ripple', 'flow', 'motionRuns'].includes(n) && !/^use[A-Z]/.test(n))).toEqual([]);
});

test('nothing outside motion/ reads the reduced-motion query', () => {
  expect(outside.filter(([, code]) => code.includes('prefers-reduced-motion')).map(([path]) => path)).toEqual([]);
});

test('motion runs only when it is neither reduced nor hidden, read when asked', () => {
  expect(motionRuns()).toBe(false);
  const on = motionOn();
  expect(motionRuns()).toBe(true);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  expect(motionRuns()).toBe(false);
  hidden.mockRestore();
  on.mockRestore();
  expect(motionRuns()).toBe(false);
});

test('play names its animation by its verb, and does nothing while motion is off', () => {
  const el = document.body.appendChild(document.createElement('p'));
  expect(play('flow', el, [{ opacity: 0 }, {}], 200)).toBeNull();
  expect(el.getAnimations()).toEqual([]);
  const on = motionOn();
  const animation = play('flow', el, [{ opacity: 0 }, {}], 200, { delay: 50 })!;
  expect(played(document.body)).toEqual([{ verb: 'flow', ms: 200, el }]);
  expect(animation.effect!.getTiming()).toMatchObject({ delay: 50, fill: 'backwards', easing: EASE_OUT });
  finish(document.body);
  on.mockRestore();
  el.remove();
});

test('eachFrame checks every frame of what plays, to its end, and fits sees a scroller that overflows', async () => {
  const scroller = document.body.appendChild(document.createElement('div'));
  scroller.style.cssText = 'width: 100px; height: 50px; overflow: auto';
  const el = scroller.appendChild(document.createElement('p'));
  el.style.cssText = 'width: 100px; height: 50px; margin: 0';
  const on = motionOn();
  const animation = play('flow', el, [{ transform: 'translateX(-80px)' }, {}], 200, { delay: 200 })!;
  const times: unknown[] = [];
  await eachFrame(scroller, () => times.push(animation.currentTime));
  expect(times).toHaveLength(40);
  expect([times[0], times.at(-1)]).toEqual([10, 400]);
  expect(played(scroller)).toEqual([]);
  expect(() => fits(scroller)).not.toThrow();
  el.style.width = '101px';
  expect(() => fits(scroller)).toThrow();
  on.mockRestore();
  scroller.remove();
});
