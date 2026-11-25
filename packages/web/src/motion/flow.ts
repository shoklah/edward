import { useLayoutEffect, useRef, type RefObject } from 'react';
import { condense } from './condense.ts';
import { CALM, SOFT, motionRuns, play } from './play.ts';

/** What moves: `el` flows from `from`, relative to where it now is: it stretches over the gap, then gathers. */
export function flow(el: Element, from: { x: number; y: number }, pseudoElement?: '::before'): Animation | null {
  if (!from.x && !from.y) return null;
  // A side that doesn't stretch thins.
  const stretch = (gap: number, size: number) => {
    const by = 1 + gap / size;
    return by > 1.02 ? by : 0.9;
  };
  // Not `getBoundingClientRect`, which a flow under way scales.
  const sx = stretch(Math.min(Math.abs(from.x), 200) * 0.5, el.clientWidth);
  const sy = stretch(Math.min(Math.abs(from.y), 160) * 0.55, el.clientHeight);
  return play(
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
}

/** The pill of a `nav`'s current link, its `::before`, flows from the last current one's place once `path` changes. */
export function usePill(nav: RefObject<HTMLElement | null>, path: string): void {
  const last = useRef<Element | null>(null);
  const flowing = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    const was = last.current;
    const now = el?.querySelector('a[aria-current="page"]') ?? null;
    last.current = now;
    if (!el || !now || now === was || !el.contains(was) || !motionRuns()) return;
    const from = was!.getBoundingClientRect();
    const to = now.getBoundingClientRect();
    const animation = flow(now, { x: from.left - to.left, y: from.top - to.top }, '::before');
    if (!animation) return;
    flowing.current = animation;
    // The pill springs past its place, which must not make what holds the nav scroll.
    el.style.overflow = 'clip';
    animation.onfinish = () => {
      if (flowing.current === animation) el.style.overflow = '';
    };
  }, [nav, path]);
}

/** A list's rows: told why by the press that changes them, before the state, they flow to their places and the new ones
 * condense; a change with no reason is drawn at once. `keys` are those of the list's children, in order, and `all` every
 * row's, on the page or not. */
export function useFlow(list: RefObject<HTMLElement | null>, keys: string[], all: string[] = keys): (why: 'sort' | 'open') => void {
  const places = useRef<ReadonlyMap<string, number>>(new Map());
  const reason = useRef<'sort' | 'open' | null>(null);
  // Not `getBoundingClientRect`, which a scroll moves and a flow under way too.
  const measure = () => new Map(keys.map((key, i) => [key, (list.current!.children[i] as HTMLElement).offsetTop]));

  useLayoutEffect(() => {
    const was = places.current;
    const why = reason.current;
    reason.current = null;
    if (!motionRuns()) {
      places.current = new Map();
      return;
    }
    const now = measure();
    places.current = now;
    const rows = keys.map((key, i) => ({ key, el: list.current!.children[i] as HTMLElement, isNew: !was.has(key) }));
    // What still flows would come from a list that is gone.
    if ([...was.keys()].join('\n') !== keys.join('\n')) {
      for (const { el } of rows) for (const animation of el.getAnimations()) animation.cancel();
    }
    if (!why || (why === 'open' && !rows.some(({ isNew }) => isNew))) return;
    const end = Math.max(...rows.map(({ key, el }) => now.get(key)! + el.offsetHeight));
    const gap = ({ key, el }: (typeof rows)[number]) => Math.min(was.get(key)!, end - el.offsetHeight) - now.get(key)!;
    const moving = rows.filter((row) => row.isNew || gap(row));
    if (why === 'sort') {
      for (const [i, row] of moving.entries()) {
        const delay = 18 * Math.min(i, 8);
        if (row.isNew) condense(row.el, { ms: 520, easing: CALM, delay });
        else slide(row.el, gap(row), 520, delay);
      }
      return;
    }
    const below = moving.filter(({ isNew }) => !isNew);
    for (const [i, row] of below.entries()) slide(row.el, gap(row), 460, 12 * Math.max(0, Math.min(below.length, 8) - 1 - i));
    for (const { el } of rows.filter(({ isNew }) => isNew)) {
      const content = el.querySelector(':scope > td > div');
      if (content) condense(content, { ms: 480, from: 'scale(0.96, 0.6)', easing: CALM });
    }
  });

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

/** A chevron turns from its closed place when its row opens. */
export function useTurn(icon: RefObject<SVGSVGElement | null>, open: boolean): void {
  const was = useRef(open);
  useLayoutEffect(() => {
    if (open && !was.current) play('flow', icon.current!, [{ transform: 'rotate(-90deg)' }, { transform: 'none' }], 160, { easing: CALM });
    was.current = open;
  }, [icon, open]);
}
