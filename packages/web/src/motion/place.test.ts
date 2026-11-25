import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { centre, importSource, inWindow, reach } from './place.ts';

beforeEach(() => page.viewport(1000, 800));
afterEach(() => document.body.replaceChildren());

/** A box in the window's coordinates, or in `parent`'s. */
function box(left: number, top: number, width: number, height: number, parent: Element = document.body): HTMLElement {
  const el = parent.appendChild(document.createElement('div'));
  el.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px`;
  return el;
}

test('a rectangle has its centre, and a place its farthest window corner', () => {
  expect(centre(new DOMRect(10, 20, 30, 40))).toEqual({ x: 25, y: 40 });
  expect(reach(0, 0)).toBe(Math.hypot(1000, 800));
  expect(reach(900, 100)).toBe(Math.hypot(900, 700));
});

test('an element is in the window only while it is drawn there', () => {
  expect(inWindow(box(0, 790, 10, 100))).toBe(true);
  expect(inWindow(box(0, 800, 10, 100))).toBe(false);
  expect(inWindow(box(0, -100, 10, 100))).toBe(false);
  const hidden = box(0, 0, 10, 10);
  hidden.style.display = 'none';
  expect(inWindow(hidden)).toBe(false);
});

test.each(['data-scroll-cue=""', 'data-slot="table-container"'])('what its region %s hides is not in the window', (attribute) => {
  document.body.innerHTML = `<div ${attribute} style="position: absolute; left: 0; top: 700px; width: 100px; height: 300px; overflow: auto"></div>`;
  const region = document.body.firstElementChild!;
  expect(inWindow(box(0, 0, 10, 10, region))).toBe(true);
  expect(inWindow(box(100, 0, 10, 10, region))).toBe(false);
  expect(inWindow(box(0, 150, 10, 10, region))).toBe(false);
});

test("an import's source is the Imported line, the Refresh button where that is hidden, and the top left with neither", () => {
  const [line, hidden, refresh] = [box(10, 700, 100, 20), box(0, 0, 10, 10), box(300, 10, 80, 30)];
  line.dataset.imported = hidden.dataset.refresh = refresh.dataset.refresh = '';
  hidden.style.display = 'none';
  expect(importSource()).toEqual({ x: 60, y: 710 });
  line.style.display = 'none';
  expect(importSource()).toEqual({ x: 340, y: 25 });
  refresh.style.display = 'none';
  expect(importSource()).toEqual({ x: 42, y: 30 });
});
