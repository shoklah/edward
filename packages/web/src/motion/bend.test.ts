import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { motionOn } from '../test/motion.ts';
import { bend, endBends, refracts, type Front } from './bend.ts';
import { Filters } from './Filters.tsx';

const LONG: Front = { x: 300, y: 200, R: 1000, ms: 5000, pow: 1.8 };
const SHORT: Front = { ...LONG, ms: 100 };
let on: { mockRestore(): void };
let el: HTMLElement;
let unmount: () => void;

beforeEach(async () => {
  await page.viewport(1200, 800);
  on = motionOn();
  el = document.body.appendChild(document.createElement('div'));
  el.style.cssText = 'position: absolute; left: 100px; top: 50px; width: 600px; height: 400px';
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  flushSync(() => root.render(createElement(Filters)));
  unmount = () => root.unmount();
});
afterEach(() => {
  endBends();
  unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  on.mockRestore();
});

const frame = () => new Promise(requestAnimationFrame);
const outsideChromium = () => vi.spyOn(Navigator.prototype as unknown as { userAgentData: unknown }, 'userAgentData', 'get').mockReturnValue(undefined);
/** The window's own scroll event. */
const scroll = () => document.dispatchEvent(new Event('scroll', { bubbles: true }));

test('it refracts only in Chromium from 768 px', async () => {
  expect(refracts()).toBe(true);
  await page.viewport(767, 800);
  expect(refracts()).toBe(false);
  await page.viewport(768, 800);
  expect(refracts()).toBe(true);
  outsideChromium();
  expect(refracts()).toBe(false);
});

test("the page's bend ends at the window's first scroll, the wash's doesn't", () => {
  bend(el, LONG, 'bend');
  expect(el.style.filter).toBe('url("#motion-bend")');
  el.dispatchEvent(new Event('scroll'));
  expect(el.style.filter).toBe('url("#motion-bend")');
  scroll();
  expect(el.style.filter).toBe('');
  bend(el, LONG, 'wash');
  expect(el.style.filter).toBe('url("#motion-wash")');
  scroll();
  expect(el.style.filter).toBe('url("#motion-wash")');
});

test("a bend's ring grows around the front's place, over the window", async () => {
  bend(el, LONG, 'wash');
  const filter = document.querySelector('#motion-wash')!;
  const sizes: number[] = [];
  for (let i = 0; i < 4; i++) {
    await frame();
    for (const img of filter.querySelectorAll('feImage')) {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(img.getAttribute(name)));
      // In el's own coordinates: 300 - 100 and 200 - 50.
      expect(x + (width - 1) / 2).toBeCloseTo(200);
      expect(y + (height - 1) / 2).toBeCloseTo(150);
      expect(height).toBe(width);
      sizes.push(width);
    }
  }
  expect(sizes.at(-1)).toBeGreaterThan(sizes[0]);
  expect(Number(filter.querySelector('feDisplacementMap')!.getAttribute('scale'))).toBeGreaterThan(0);
  expect(['x', 'y', 'width', 'height'].map((name) => Number(filter.getAttribute(name)))).toEqual([-100, -50, 1200, 800]);
});

test('a filter is gone when its front is done, and endBends takes it off at once', async () => {
  bend(el, SHORT, 'wash');
  expect(el.style.filter).not.toBe('');
  await vi.waitFor(() => expect(el.style.filter).toBe(''));
  bend(el, LONG, 'bend');
  endBends();
  expect(el.style.filter).toBe('');
  await frame();
  expect(el.style.filter).toBe('');
});

test('one element at most is drawn through a filter, and an ended bend leaves the next one alone', async () => {
  const other = document.body.appendChild(document.createElement('div'));
  bend(el, SHORT, 'bend');
  bend(other, LONG, 'wash');
  expect([el.style.filter, other.style.filter]).toEqual(['', 'url("#motion-wash")']);
  scroll();
  await new Promise((done) => setTimeout(done, 200));
  expect(other.style.filter).toBe('url("#motion-wash")');
});

test('a wash calls what ends it as its filter or cut comes off, in the same task', async () => {
  const ends: string[] = [];
  bend(el, SHORT, 'wash', () => ends.push(el.style.filter));
  expect(ends).toEqual([]);
  await vi.waitFor(() => expect(ends).toEqual(['']));
  bend(el, LONG, 'wash', () => ends.push('bent'));
  endBends();
  expect(ends).toEqual(['', 'bent']);
  outsideChromium();
  bend(el, LONG, 'wash', () => ends.push('cut'));
  endBends();
  expect(ends).toEqual(['', 'bent', 'cut']);
});

test('at 767 px the bend does nothing', async () => {
  await page.viewport(767, 800);
  bend(el, LONG, 'bend');
  expect(el.style.filter).toBe('');
});

test('outside Chromium the wash is a clip-path that keeps everything but the circle, and the bend does nothing', async () => {
  outsideChromium();
  bend(el, LONG, 'bend');
  expect([el.style.filter, el.style.clipPath]).toEqual(['', '']);
  bend(el, LONG, 'wash');
  await frame();
  await frame();
  expect(el.style.clipPath).toMatch(/^path\(evenodd/);
  expect(el.style.filter).toBe('');
  // The front's circle starts round (300, 200), and the box's far corner is kept until the front is there.
  expect(document.elementFromPoint(300, 200)).not.toBe(el);
  expect(document.elementFromPoint(690, 440)).toBe(el);
  endBends();
  expect(el.style.clipPath).toBe('');
  bend(el, SHORT, 'wash');
  expect(el.style.clipPath).not.toBe('');
  await vi.waitFor(() => expect(el.style.clipPath).toBe(''));
});

test('under reduced motion nothing bends', () => {
  on.mockRestore();
  bend(el, LONG, 'bend');
  bend(el, LONG, 'wash');
  expect([el.style.filter, el.style.clipPath]).toEqual(['', '']);
});
