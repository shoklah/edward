import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { motionOn } from '../test/motion.ts';
import type { Drop } from './water.ts';

let drop: (typeof import('./water.ts'))['drop'];
let fresh = 0;
let on: { mockRestore(): void };
const errors = vi.spyOn(console, 'error');
const canvases = () => document.querySelectorAll<HTMLCanvasElement>('canvas[data-water]');
const SMALL: Drop = { R: 60, ms: 120, amp: 1, pow: 1.6, train: 60 };
const frame = () => new Promise(requestAnimationFrame);

beforeEach(async () => {
  on = motionOn();
  // Its state starts anew in each test: a module of its own by its URL, since `vi.resetModules` does nothing in a browser.
  ({ drop } = await import(/* @vite-ignore */ `./water.ts?fresh=${fresh++}`));
});
afterEach(() => {
  on.mockRestore();
  for (const canvas of canvases()) canvas.remove();
  document.documentElement.classList.remove('dark');
  expect(errors).not.toHaveBeenCalled();
});

test('the canvas is in the page only while a drop runs, over the window and out of reach', async () => {
  drop(20, 20, SMALL);
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-water="wave"]')!;
  expect([canvas.width, canvas.height]).toEqual([innerWidth, innerHeight]);
  expect(canvas.getBoundingClientRect()).toMatchObject({ left: 0, top: 0, width: innerWidth, height: innerHeight });
  expect(canvas).toHaveAttribute('aria-hidden', 'true');
  expect(getComputedStyle(canvas).pointerEvents).toBe('none');
  await vi.waitFor(() => expect(document.querySelector('canvas')).toBeNull());
});

test('a second drop joins the first on the one canvas, which stays until both are done', async () => {
  drop(20, 20, SMALL);
  drop(90, 90, { ...SMALL, ms: 400 });
  expect(canvases()).toHaveLength(1);
  await new Promise((done) => setTimeout(done, 200));
  expect(canvases()).toHaveLength(1);
  await vi.waitFor(() => expect(canvases()).toHaveLength(0));
  drop(20, 20, SMALL);
  expect(canvases()).toHaveLength(1);
  await vi.waitFor(() => expect(canvases()).toHaveLength(0));
});

// Dark only adds light, so a pixel's colour passes its alpha; light's ink never does.
test.each([['dark', true], ['light', false]])('it draws its light in %s', async (mode, adds) => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  drop(150, 150, { R: 120, ms: 2000, amp: 1.4, pow: 1.8, train: 150 });
  const gl = canvases()[0].getContext('webgl2')!;
  const pixels = new Uint8Array(4 * 300 * 300);
  for (const start = performance.now(); performance.now() - start < 100; ) await frame();
  gl.readPixels(0, gl.drawingBufferHeight - 300, 300, 300, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const over = Math.max(...Array.from({ length: 300 * 300 }, (_, i) => Math.max(...pixels.subarray(4 * i, 4 * i + 3)) - pixels[4 * i + 3]));
  expect(pixels.some((value) => value > 8)).toBe(true);
  expect(over > 8).toBe(adds);
});

test('a lost context ends the light for good', async () => {
  drop(20, 20, SMALL);
  canvases()[0].dispatchEvent(new Event('webglcontextlost'));
  expect(canvases()).toHaveLength(0);
  await frame();
  await frame();
  drop(20, 20, SMALL);
  expect(canvases()).toHaveLength(0);
});

test('with no WebGL2 there is no light', () => {
  const none = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  drop(20, 20, SMALL);
  none.mockRestore();
  expect(canvases()).toHaveLength(0);
});

test('under reduced motion a drop does nothing', () => {
  on.mockRestore();
  drop(20, 20, SMALL);
  expect(canvases()).toHaveLength(0);
});
