import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import '../index.css';
import { WRAP_MIN, layout, stagesOf } from '../runs/flow.ts';
import { RunFlow } from '../runs/RunFlow.tsx';
import { motionOn, played } from '../test/motion.ts';
import { runFull } from '../test/runs.ts';
import { draw } from './draw.ts';
import { EASE_OUT } from './play.ts';

const stages = stagesOf(runFull.timeline);
let root: Root | null = null;
let on: { mockRestore(): void };
beforeEach(() => {
  on = motionOn();
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  on.mockRestore();
});

/** The full run's graph in a box of a width, with a step selected: its HTML children, its ring aside, and its lines. */
async function render(width: number) {
  const el = document.body.appendChild(document.createElement('div'));
  el.style.width = `${width}px`;
  root = createRoot(el);
  await act(async () => root!.render(<RunFlow stages={stages} selected="t1" onSelect={() => {}} />));
  const group = el.querySelector<HTMLElement>('[role="group"]')!;
  expect(group.querySelectorAll('[data-ring]')).toHaveLength(1);
  return {
    group,
    items: [...group.firstElementChild!.children].filter((child) => child.tagName !== 'svg' && !child.matches('[data-ring]')),
    paths: [...group.querySelectorAll<SVGPathElement>('svg > path')],
  };
}

const timing = (el: Element) => el.getAnimations()[0].effect!.getTiming();
const delay = (el: Element) => timing(el).delay!;

test.each([['flat', 3000], ['wrapped', WRAP_MIN], ['upright', 343]] as const)('a %s graph draws in reading order', async (shape, width) => {
  const { placed } = layout(stages, width);
  expect(layout(stages, width).shape).toBe(shape);
  const { group, items, paths } = await render(width);
  expect(items).toHaveLength(placed.length);
  draw(group, 0);
  const delays = items.map(delay);
  expect(delays).toEqual([...delays].sort((a, b) => a - b));
  expect([delays[0], delays.at(-1)]).toEqual([0, 900]);
  expect([items[0].textContent, items.at(-1)!.textContent]).toEqual([expect.stringMatching(/^Started/), expect.stringMatching(/^Record written/)]);
  // A row is done before the next starts.
  placed.forEach((p, i) => placed.forEach((q, j) => p.row < q.row && expect(delays[i]).toBeLessThan(delays[j])));
  expect(paths.every((path) => delay(path) >= 60 && delay(path) <= 960)).toBe(true);
  // Each line comes 60 ms after the box, pill or label it leaves: the first leaves "Started".
  const starts = new Set(delays.map((d) => Math.round(d + 60)));
  expect(paths.filter((path) => !starts.has(Math.round(delay(path))))).toEqual([]);
  expect(delay(paths[0])).toBe(60);
  expect(new Set(paths.map(delay)).size).toBeGreaterThan(5);
});

test('boxes, pills, labels and chips condense, a solid line is drawn, a dashed one and a fade condense, all from `after`', async () => {
  const { group, items, paths } = await render(WRAP_MIN);
  const before = group.innerHTML;
  draw(group, 500);
  // The ring is already there.
  expect(played(group)).toHaveLength(items.length + paths.length);
  const frames = (el: Element) => (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
  const easing = new KeyframeEffect(null, [], { easing: EASE_OUT }).getTiming().easing;
  for (const item of items) {
    expect([item.getAnimations()[0].id, timing(item)]).toMatchObject(['condense', { duration: 180, easing, fill: 'backwards' }]);
    expect(frames(item)[0]).toMatchObject({ opacity: '0', transform: 'scale(0.95)', transformOrigin: 'center center' });
  }
  expect([delay(items[0]), delay(items.at(-1)!)]).toEqual([500, 1400]);
  const faint = paths.filter((path) => path.hasAttribute('stroke-dasharray') || path.getAttribute('stroke')!.startsWith('url('));
  const solid = paths.filter((path) => !faint.includes(path));
  expect(faint.some((path) => path.hasAttribute('stroke-dasharray'))).toBe(true);
  expect(faint.some((path) => !path.hasAttribute('stroke-dasharray'))).toBe(true);
  for (const path of faint) {
    expect([path.getAnimations()[0].id, timing(path).duration]).toEqual(['condense', 160]);
    expect(frames(path)[0]).toMatchObject({ opacity: '0', transform: 'none' });
  }
  for (const path of solid) {
    expect([path.getAnimations()[0].id, timing(path).duration]).toEqual(['flow', 260]);
    const length = path.getTotalLength();
    const [from, to] = frames(path);
    expect(parseFloat(from.strokeDashoffset as string)).toBeCloseTo(length, 1);
    expect(parseFloat(to.strokeDashoffset as string)).toBe(0);
    for (const frame of [from, to]) {
      expect(parseFloat(frame.strokeDasharray as string)).toBeCloseTo(length, 1);
      expect(frame.markerEnd).toBe('none');
    }
  }
  // Nothing is written to the DOM.
  expect(group.innerHTML).toBe(before);
});

test('a graph draws nothing while motion is off, nor by itself when it wasn\'t reached by a press', async () => {
  const { group } = await render(WRAP_MIN);
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  expect(played(group)).toEqual([]);
  on.mockRestore();
  draw(group, 0);
  expect(played(group)).toEqual([]);
});
