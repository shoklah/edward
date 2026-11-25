import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page } from 'vitest/browser';
import type { StatusResponse } from '@cwd/shared';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { accessibleText, finish, motionOn, played } from '../test/motion.ts';
import { endBends } from './bend.ts';
import { Filters } from './Filters.tsx';

let ripple: typeof import('./ripple.ts');
let fresh = 0;
let on: { mockRestore(): void };
let host: HTMLElement;
let root: Root;

type Landing = { at: number | null; viewing?: string | null; path?: string; drawn?: boolean | null; values: number[]; top?: number };

const status = ({ at, viewing = null }: Pick<Landing, 'at' | 'viewing'>): StatusResponse | undefined =>
  at === null
    ? undefined
    : {
        lastImportAt: null,
        lastGoodImportAt: `2026-11-12T${at}:00:00.000Z`,
        error: null,
        importing: false,
        account: { login: 'rowan-k', viewing, viewable: ['mika-ito'], admin: false },
      };

function Cell({ value }: { value: number }) {
  const { ref, children } = ripple.useRipple<HTMLTableCellElement>(String(value));
  return <td ref={ref} style={{ padding: 20 }}>{children}</td>;
}

/** A page's panel: what it draws of one live query (`drawn` null with no data, false with placeholder data). */
function Probe({ path = '/api/home', drawn = true, values, top = 0, ...landing }: Landing) {
  ripple.useLanding(path, status(landing), drawn ?? undefined);
  return (
    <div className="glass" style={{ marginTop: top }}>
      <table>
        <tbody>
          <tr>{values.map((value, i) => <Cell key={i} value={value} />)}</tr>
        </tbody>
      </table>
    </div>
  );
}

beforeEach(async () => {
  await page.viewport(1200, 800);
  on = motionOn();
  // Its state starts anew in each test: a module of its own by its URL.
  ripple = await import(/* @vite-ignore */ `./ripple.ts?fresh=${fresh++}`);
  // Only the host goes after each test: the water's canvas leaves by itself.
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(() => {
  endBends();
  root.unmount();
  host.remove();
  on.mockRestore();
});

/** Draws the panels, with what the commit's microtasks add to it: what is painted. */
async function render(...panels: Landing[]): Promise<void> {
  flushSync(() =>
    root.render(
      <>
        <Filters />
        <p data-imported>Imported</p>
        <main id="main">{panels.map((panel, i) => <Probe key={i} {...panel} />)}</main>
      </>,
    ),
  );
  await Promise.resolve();
}

const cell = (i: number) => host.querySelectorAll('td')[i];
const held = () => [...host.querySelectorAll<HTMLElement>('[data-drop]')];
const times = () => played(document.body).map(({ ms }) => ms);

test('a number an import changed keeps its old look over it until the front arrives', async () => {
  await render({ at: 10, values: [1] });
  await render({ at: 11, values: [2] });
  const drop = cell(0).querySelector('[data-drop="drop"]')!;
  expect([...drop.querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent)).toEqual(['', '1']);
  expect(accessibleText(cell(0))).toBe('2');
  expect(document.querySelector('canvas[data-water]')).not.toBeNull();
  expect(document.getElementById('main')!.style.filter).toBe('url("#motion-bend")');
  // Nothing of it has started: the old one is whole and the new one unseen.
  const [, was, is] = drop.children;
  expect([getComputedStyle(was).opacity, getComputedStyle(is).opacity]).toEqual(['1', '0']);
  const delays = played(cell(0)).map(({ el, ms }) => [ms, el.getAnimations()[0].effect!.getTiming().delay!]);
  expect(delays.map(([ms]) => ms).sort((a, b) => a - b)).toEqual([374, 1054, 2550]);
  // The front takes 2 s over the window, and the number is near its source.
  for (const [, delay] of delays) expect(delay).toBeGreaterThan(0);
  expect(played(host).filter(({ el }) => !cell(0).contains(el)).map(({ ms, el }) => [ms, el.className || el.tagName])).toEqual([
    [900, 'P'],
    [1200, 'glass'],
  ]);
  finish(document.body);
  await vi.waitFor(() => expect(cell(0).innerHTML).toBe('2'));
});

test('a number changed with no landing is forgotten', async () => {
  await render({ at: 10, path: '/api/home', values: [1] });
  await render({ at: 10, path: '/api/home?weeks=8', values: [2] });
  await render({ at: 11, path: '/api/home?weeks=8', values: [2] });
  expect(held()).toEqual([]);
  expect(times()).toEqual([]);
});

test('a landing of another path than the one drawn before starts nothing', async () => {
  await render({ at: 10, path: '/api/home', values: [1] });
  await render({ at: 11, path: '/api/home?weeks=8', values: [2] });
  expect(held()).toEqual([]);
  expect(times()).toEqual([]);
});

test('a second landing of one import joins its wave', async () => {
  await render({ at: 10, values: [1] }, { at: 10, path: '/api/weeks', values: [5] });
  await render({ at: 11, values: [2] }, { at: 11, path: '/api/weeks', drawn: false, values: [5] });
  expect(held()).toHaveLength(1);
  await render({ at: 11, values: [2] }, { at: 11, path: '/api/weeks', values: [6] });
  expect(held().map((el) => accessibleText(el))).toEqual(['2', '6']);
  expect(played(host.querySelector('[data-imported]')!)).toMatchObject([{ verb: 'ripple', ms: 900 }]);
  expect(times().filter((ms) => ms === 1200)).toHaveLength(2);
});

test('the first status and a switch of account are no import', async () => {
  await render({ at: null, values: [1] });
  await render({ at: 10, values: [2] });
  expect(held()).toEqual([]);
  await render({ at: 11, viewing: 'mika-ito', values: [3] });
  expect(held()).toEqual([]);
  expect(times()).toEqual([]);
  await render({ at: 12, viewing: 'mika-ito', values: [4] });
  expect(held()).toHaveLength(1);
});

test.each([['status', { at: null }], ['data', { at: 10, drawn: null }]] as const)('with no %s, what it knew starts afresh', async (_, none) => {
  await render({ at: 10, values: [1] });
  await render({ ...none, values: [1] });
  await render({ at: 11, values: [2] });
  expect(held()).toEqual([]);
  expect(times()).toEqual([]);
  await render({ at: 12, values: [3] });
  expect(held()).toHaveLength(1);
});

test('placeholder data keeps what it knew', async () => {
  await render({ at: 10, values: [1] });
  await render({ at: 11, drawn: false, values: [1] });
  await render({ at: 11, values: [2] });
  expect(held()).toHaveLength(1);
});

test('a status gone and back with a later import, as showing mode starts, is no import', async () => {
  const client = new QueryClient();
  function Imports({ at }: { at: number | null }) {
    ripple.useImports(status({ at }));
    return <svg data-eye />;
  }
  const shell = async (at: number | null) => {
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Imports at={at} />
        </QueryClientProvider>,
      ),
    );
    await new Promise((done) => setTimeout(done));
  };
  // Earlier tests' water leaves first.
  const waves = () => document.querySelectorAll('canvas[data-water="wave"]').length;
  await vi.waitFor(() => expect(waves()).toBe(0), { timeout: 6000 });
  for (const at of [10, null, 11]) await shell(at);
  expect(times()).toEqual([]);
  // One not answered yet, its data still on the way, is forgotten too.
  let answer = () => {};
  const fetching = client.fetchQuery({ queryKey: ['/api/home'], queryFn: () => new Promise((resolve) => (answer = () => resolve(1))) });
  await shell(12);
  expect(times()).toEqual([260]);
  await shell(null);
  await shell(12);
  answer();
  await fetching;
  await shell(12);
  expect(waves()).toBe(0);
  // Another import, with nothing on the way, is answered.
  await shell(13);
  expect(waves()).toBe(1);
}, 15_000);

test('placeholder data lands nothing', async () => {
  await render({ at: 10, values: [1] });
  await render({ at: 11, drawn: false, values: [2] });
  expect(held()).toEqual([]);
  // Its own data, with nothing new in it.
  await render({ at: 11, values: [2] });
  expect(held()).toEqual([]);
  expect(times()).toEqual([]);
});

test('of twelve numbers nine drop, spread, and three swap', async () => {
  const values = Array.from({ length: 12 }, (_, i) => i);
  await render({ at: 10, values });
  await render({ at: 11, values: values.map((v) => v + 1) });
  expect(held().flatMap((el, i) => (el.dataset.drop === 'swap' ? [i] : []))).toEqual([3, 7, 11]);
  expect(held()).toHaveLength(12);
  // A swap has no glass: the old one off and the new one on, at the front.
  const [was, is] = held()[3].children;
  expect(was.textContent).toBe('3');
  expect([getComputedStyle(was).opacity, getComputedStyle(is).opacity]).toEqual(['1', '0']);
  finish(held()[3]);
  await vi.waitFor(() => expect(cell(3).innerHTML).toBe('4'));
});

test('later landings of an import share its nine drops', async () => {
  const eight = Array.from({ length: 8 }, (_, i) => i);
  const more = (by: number) => eight.map((v) => v + by);
  await render({ at: 10, values: eight }, { at: 10, path: '/api/weeks', values: eight });
  await render({ at: 11, values: more(1) }, { at: 11, path: '/api/weeks', drawn: false, values: eight });
  await render({ at: 11, values: more(1) }, { at: 11, path: '/api/weeks', values: more(1) });
  expect(held().map((el) => el.dataset.drop)).toEqual([...Array(9).fill('drop'), ...Array(7).fill('swap')]);
});

test('a number outside the window changes at once and starts nothing', async () => {
  await render({ at: 10, top: 900, values: [1] });
  await render({ at: 11, top: 900, values: [2] });
  expect(cell(0).innerHTML).toBe('2');
  expect(times()).toEqual([]);
});

test.each(['a focused select', 'a focused text field', 'a dialog open'])('with %s, everything changes at once', async (what) => {
  await render({ at: 10, values: [1] });
  const el = document.createElement(what === 'a focused select' ? 'select' : what === 'a dialog open' ? 'div' : 'input');
  if (what === 'a dialog open') el.setAttribute('role', 'dialog');
  host.append(el);
  el.focus();
  await render({ at: 11, values: [2] });
  expect(cell(0).innerHTML).toBe('2');
  expect(times()).toEqual([]);
});

test('under reduced motion everything changes at once', async () => {
  await render({ at: 10, values: [1] });
  on.mockRestore();
  await render({ at: 11, values: [2] });
  expect(cell(0).innerHTML).toBe('2');
  expect(times()).toEqual([]);
});

test('a number changed again inside its drop shows the newest, with nothing left over', async () => {
  await render({ at: 10, values: [1] });
  await render({ at: 11, values: [2] });
  expect(held()).toHaveLength(1);
  await render({ at: 12, values: [3] });
  expect(held()).toHaveLength(1);
  expect(accessibleText(cell(0))).toBe('3');
  expect(held()[0].children[1].textContent).toBe('2');
  expect(played(cell(0))).toHaveLength(3);
  finish(document.body);
  await vi.waitFor(() => expect(held()).toEqual([]));
  expect(cell(0).innerHTML).toBe('3');
});

test('a filter changing a number inside its drop ends the drop', async () => {
  await render({ at: 10, values: [1] });
  await render({ at: 11, values: [2] });
  await render({ at: 11, path: '/api/home?weeks=8', values: [3] });
  expect(cell(0).innerHTML).toBe('3');
});
