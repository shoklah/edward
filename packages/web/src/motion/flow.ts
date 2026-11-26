import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { clip } from './clip.ts';
import { condense } from './condense.ts';
import { inWindow } from './place.ts';
import { CALM, SOFT, motionRuns, play } from './play.ts';
import { notice } from './ripple.ts';
import { drop } from './water.ts';

/** What moves: `el` flows from `from`, relative to where it now is: it stretches over the gap, then gathers. It springs
 * past its place, so `within`, the app's root unless told, is clipped while it does. */
export function flow(el: Element, from: { x: number; y: number }, within?: HTMLElement, pseudoElement?: '::before'): void {
  if (!from.x && !from.y) return;
  // A side that doesn't stretch thins.
  const stretch = (gap: number, size: number) => {
    const by = 1 + gap / size;
    return by > 1.02 ? by : 0.9;
  };
  // Not `getBoundingClientRect`, which a flow under way scales.
  const sx = stretch(Math.min(Math.abs(from.x), 200) * 0.5, el.clientWidth);
  const sy = stretch(Math.min(Math.abs(from.y), 160) * 0.55, el.clientHeight);
  const animation = play(
    'flow',
    el,
    [
      { transform: `translate(${from.x}px, ${from.y}px)` },
      { transform: `translate(${from.x / 2}px, ${from.y / 2}px) scale(${sx}, ${sy})`, offset: 0.3, easing: SOFT },
      { transform: 'none' },
    ],
    420,
    { easing: 'ease-in', pseudoElement },
  );
  if (animation) clip([animation], within);
}

/** The pill of a `nav`'s current link, its `::before`, flows from the last current one's place once `path` changes. */
export function usePill(nav: RefObject<HTMLElement | null>, path: string): void {
  const last = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    const was = last.current;
    const now = el?.querySelector('a[aria-current="page"]') ?? null;
    last.current = now;
    if (!el || !now || now === was || !el.contains(was) || !motionRuns()) return;
    const from = was!.getBoundingClientRect();
    const to = now.getBoundingClientRect();
    flow(now, { x: from.left - to.left, y: from.top - to.top }, el, '::before');
  }, [nav, path]);
}

/** A list's rows: told why by the press that changes them, before the state, they flow to their places and the new ones
 * condense; a change with no reason is drawn at once, unless an import lands it: then what is new to the list, not only to
 * the page, lands as a drop, and the rest flow. `keys` are those of the list's children, in order, and `all` every row's,
 * on the page or not. */
export function useFlow(list: RefObject<HTMLElement | null>, keys: string[], all: string[] = keys): (why: 'sort' | 'open') => void {
  const places = useRef<ReadonlyMap<string, number>>(new Map());
  const known = useRef<ReadonlySet<string> | null>(null);
  const reason = useRef<'sort' | 'open' | null>(null);
  const light = useRef(0);
  // Not `getBoundingClientRect`, which a scroll moves and a flow under way too.
  const measure = () => new Map(keys.map((key, i) => [key, (list.current!.children[i] as HTMLElement).offsetTop]));

  useLayoutEffect(() => {
    const [was, held] = [places.current, known.current];
    const why = reason.current;
    reason.current = null;
    if (!motionRuns()) {
      clearTimeout(light.current);
      [places.current, known.current] = [new Map(), null];
      return;
    }
    const now = measure();
    [places.current, known.current] = [now, new Set(all)];
    const rows = keys.map((key, i) => ({ key, el: list.current!.children[i] as HTMLElement, isNew: !was.has(key) }));
    // What still flows would come from a list that is gone.
    const changed = [...was.keys()].join('\n') !== keys.join('\n');
    if (changed) {
      clearTimeout(light.current);
      for (const { el } of rows) for (const animation of el.getAnimations()) animation.cancel();
    }
    if (keys.length === 0) return;
    if (why === 'open' && !rows.some(({ isNew }) => isNew)) return;
    if (!why && (!changed || !held)) return;
    const { bottom: end, height } = list.current!.getBoundingClientRect();
    // What a condensing panel scales the list by; `offsetHeight` is a whole number.
    const scale = height / parseFloat(getComputedStyle(list.current!).height);
    // A row starts no lower than where its foot meets the list's end, in real pixels: the places are whole ones, and even
    // part of a pixel past the end scrolls the list.
    const placed = rows.map((row) => {
      const gap = row.isNew ? 0 : was.get(row.key)! - now.get(row.key)!;
      return { ...row, gap, from: gap > 0 ? Math.min(gap, (end - row.el.getBoundingClientRect().bottom) / scale) : gap };
    });
    const moving = placed.filter(({ isNew, from }) => isNew || from);
    const below = moving.filter(({ isNew }) => !isNew);
    const lastFirst = (i: number) => Math.max(0, Math.min(below.length, 8) - 1 - i);
    if (!why) {
      const fresh = rows.filter(({ key }) => !held!.has(key));
      const shown = fresh.find(({ el }) => inWindow(el));
      // Waiting at its old place, a row would stand on one brought onto the page, which is drawn at once, or on another
      // where its old place lies past the list's end (by more than a whole number's rounding).
      const crowded = placed.some(({ key, isNew, gap, from }) => (isNew ? held!.has(key) : gap - from > 1));
      // Scrolled past its head, the browser keeps what is read in place: there its rows haven't moved.
      const moved = crowded || !inWindow(rows[0].el) ? [] : below;
      const at = shown ?? moved[0];
      if (!at) return;
      // All read before the first is moved.
      const heights = fresh.map(({ el }) => el.getBoundingClientRect().height / scale);
      const land = (delay: number) => {
        for (const [i, row] of moved.entries()) slide(row.el, row.from, 560, delay + 16 * lastFirst(i));
        for (const [i, { el }] of fresh.entries()) fall(el, heights[i], delay);
        if (!shown) return;
        light.current = window.setTimeout(() => {
          const { left, top, width } = list.current!.getBoundingClientRect();
          drop(left + width / 2, top + 30, { R: 190, ms: 1400, amp: 0.9, pow: 1.6, train: 80 });
        }, delay);
      };
      notice({ at: at.el, counts: shown !== undefined, number: false, land });
      return;
    }
    if (why === 'sort') {
      for (const [i, row] of moving.entries()) {
        const delay = 18 * Math.min(i, 8);
        if (row.isNew) condense(row.el, { ms: 520, easing: CALM, delay });
        else slide(row.el, row.from, 520, delay);
      }
      return;
    }
    for (const [i, row] of below.entries()) slide(row.el, row.from, 460, 12 * lastFirst(i));
    for (const { el } of rows.filter(({ isNew }) => isNew)) {
      const content = el.querySelector(':scope > td > div');
      if (content) condense(content, { ms: 480, from: 'scale(0.96, 0.6)', easing: CALM });
    }
  });
  useEffect(() => () => clearTimeout(light.current), []);

  return (why) => {
    if (!motionRuns()) return;
    places.current = measure();
    reason.current = why;
  };
}

/** A list's row flows down or up from `y`, with no stretch, so it stays inside its list. */
function slide(el: Element, y: number, ms: number, delay: number): void {
  play('flow', el, [{ transform: `translateY(${y}px)` }, { transform: 'none' }], ms, { easing: CALM, delay });
}

/** A list's new row, `height` px tall, falls to its place from over it, once the rest have started down, and its
 * stretch never passes its foot. */
function fall(el: Element, height: number, delay: number): void {
  const [up, across, stretch, after] = el.matches('tr') ? [26, 0.96, 0.3, 80] : [34, 0.5, 0.2, 150];
  const from = `translateY(${-Math.max(up, stretch * height)}px) scale(${across}, ${1 + stretch})`;
  const origin = { transformOrigin: '0 0' };
  play('ripple', el, [{ opacity: 0, transform: from, ...origin }, { opacity: 1, offset: 0.18 }, { opacity: 1, transform: 'none', ...origin }], 680, { easing: CALM, delay: delay + after });
}

/** A chevron turns from its closed place when its row opens. */
export function useTurn(icon: RefObject<SVGSVGElement | null>, open: boolean): void {
  const was = useRef(open);
  useLayoutEffect(() => {
    if (open && !was.current) play('flow', icon.current!, [{ transform: 'rotate(-90deg)' }, { transform: 'none' }], 160, { easing: CALM });
    was.current = open;
  }, [icon, open]);
}
