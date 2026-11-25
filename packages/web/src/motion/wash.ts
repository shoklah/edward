import { createElement, useEffect, type ReactNode, type RefObject } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { bend, bending, endBends, reaches, type Front } from './bend.ts';
import { clip } from './clip.ts';
import { condense } from './condense.ts';
import { Filters } from './Filters.tsx';
import { centre, inWindow, reach, sourceOf, wide } from './place.ts';
import { FIRM, motionRuns, play } from './play.ts';
import { drop, warm } from './water.ts';

/** Where a copy's regions were scrolled, which only an attached one can be. */
const scrolled = new WeakMap<Element, { left: number; top: number }>();

/** A detached copy of `el` as the reader saw it, with no filter, drop of water or typed password, and no `id` but the ones
 * its own `url(#…)`s point to (a graph's arrowheads and gradients), renamed so none is on the page twice. */
function copyOf(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  const twins = [copy, ...copy.querySelectorAll('*')];
  const named = twins.filter((twin) => twin.hasAttribute('id'));
  const ids = new Set(named.map(({ id }) => id));
  const kept = new Set<string>();
  for (const drawn of copy.querySelectorAll('svg, svg *')) {
    for (const name of drawn.getAttributeNames()) {
      const value = drawn.getAttribute(name)!;
      if (!value.includes('url(')) continue;
      const renamed = value.replace(/url\((["']?)#(.+?)\1\)/g, (ref, quote, id) => {
        if (!ids.has(id)) return ref;
        kept.add(id);
        return `url(${quote}#copy-${id}${quote})`;
      });
      drawn.setAttribute(name, renamed);
    }
  }
  for (const twin of named) {
    if (kept.has(twin.id)) twin.id = `copy-${twin.id}`;
    else twin.removeAttribute('id');
  }
  for (const [i, was] of [el, ...el.querySelectorAll('*')].entries()) {
    if (was.scrollLeft || was.scrollTop) scrolled.set(twins[i], { left: was.scrollLeft, top: was.scrollTop });
    // A clone keeps a ticked box but not a picked option.
    if (was instanceof HTMLSelectElement) (twins[i] as HTMLSelectElement).selectedIndex = was.selectedIndex;
    if (was instanceof HTMLInputElement && was.type === 'password') {
      (twins[i] as HTMLInputElement).value = '';
      twins[i].removeAttribute('value');
    }
  }
  copy.style.filter = '';
  for (const extra of copy.querySelectorAll('[data-drop] > [aria-hidden]')) extra.remove();
  return copy;
}

function put({ style }: HTMLElement, { left, top, width, height }: DOMRect): void {
  Object.assign(style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, margin: '0' });
}

/** A copy of the page, put where the page stands. */
export function pageCopy(main: HTMLElement): HTMLElement {
  const copy = copyOf(main);
  put(copy, main.getBoundingClientRect());
  return copy;
}

/** Puts copies, each put already, in the page in an inert layer: over the backdrop and under the live page, or a list's
 * `items`, over the live page in a layer that is `at`. */
export function attach(kind: 'page' | 'items' | 'prepare', copies: Node[], at?: DOMRect): HTMLElement {
  const layer = document.createElement('div');
  layer.dataset.copy = kind;
  layer.ariaHidden = 'true';
  layer.inert = true;
  layer.append(...copies);
  if (at) put(layer, at);
  else Object.assign(layer.style, { inset: '0', zIndex: '-1' });
  Object.assign(layer.style, { position: 'fixed', overflow: 'hidden', pointerEvents: 'none' });
  document.body.append(layer);
  for (const el of layer.querySelectorAll('*')) {
    const place = scrolled.get(el);
    if (place) [el.scrollLeft, el.scrollTop] = [place.left, place.top];
  }
  return layer;
}

const PANEL = '.glass, [data-slot="table-container"]';

/** A page's outermost panels in the window. */
export function panelsOf(main: HTMLElement): Element[] {
  return [...main.querySelectorAll(PANEL)].filter((el) => !el.parentElement!.closest(PANEL) && inWindow(el)).slice(0, 16);
}

/** A page's blocks in the window: its outermost panels, then the smallest set of elements covering what they don't. */
function blocks(main: HTMLElement): Element[] {
  const panels = panelsOf(main);
  const loose: Element[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (panels.includes(child)) continue;
      if (panels.some((panel) => child.contains(panel))) walk(child);
      else if (inWindow(child)) loose.push(child);
    }
  };
  walk(main);
  return [...panels, ...loose.slice(0, 16)];
}

/** A title flows from the place and the text size of the link that opened its page. */
function travel(title: Element, from: DOMRect, size: number): Animation | null {
  const to = title.getBoundingClientRect();
  const scale = size / parseFloat(getComputedStyle(title).fontSize);
  return play(
    'flow',
    title,
    [
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' },
    ],
    620,
    { easing: FIRM },
  );
}

/** A page switch under way: when its load started, and from 768 px the old page's copy. */
let pending: { at: number; copy: HTMLElement | null } | null = null;
/** Stops the last wave, its light aside. */
let stopWave = () => {};
/** Whether the filters and the shader have run. */
let prepared = false;
/** Whether a page switch brought the reader here and nothing has read so yet. */
let arrived = false;
/** How many times the copies have been dropped: a list's are only for the page they were made in. */
let clears = 0;

/** What leaves a list, whose children's keys are `keys`: those in the window are copied, as they stand; `left`, told the
 * keys that remain once it is drawn again, washes the others away over it, the last first, and returns how many ms that
 * takes, 0 when none do. */
export function wash(list: HTMLElement, keys: string[]): { left(remaining: string[]): number } {
  if (!motionRuns() || !wide()) return { left: () => 0 };
  const made = clears;
  // The list may be gone by then; its panel isn't.
  const panel = list.closest('.glass')!;
  const was = panel.getBoundingClientRect();
  const region = list.closest('[data-scroll-cue]')!;
  const clipped = region.getBoundingClientRect();
  // What the copies take from where they stand: the panel's text, and the region's faded edges.
  const [{ font }, { maskImage }] = [getComputedStyle(list), getComputedStyle(region)];
  const copies = [...list.children].flatMap((el, i) => {
    if (!inWindow(el)) return [];
    const copy = copyOf(el as HTMLElement);
    const { left, top, width, height } = el.getBoundingClientRect();
    put(copy, new DOMRect(left - clipped.left, top - clipped.top, width, height));
    return [{ key: keys[i], copy }];
  });
  return {
    left(remaining) {
      const leaving = copies.filter(({ key }) => !remaining.includes(key)).map(({ copy }) => copy);
      if (leaving.length === 0 || made !== clears || !motionRuns()) return 0;
      const now = panel.getBoundingClientRect();
      const at = new DOMRect(clipped.left + now.left - was.left, clipped.top + now.top - was.top, clipped.width, clipped.height);
      const layer = attach('items', leaving, at);
      Object.assign(layer.style, { font, maskImage });
      const steps = Math.min(leaving.length - 1, 8);
      const ends = leaving.map((copy, i) => {
        const frames = [
          { opacity: 1 },
          { opacity: 0.9, transform: 'translateY(6px) scale(0.99, 1.08)', offset: 0.4 },
          { opacity: 0, transform: 'translateY(46px) scale(0.86, 1.35)' },
        ];
        return play('wash', copy, frames, 260, { easing: 'ease-in', delay: 34 * Math.max(0, steps - i), fill: 'both' })?.finished;
      });
      // A cancelled animation's end is a rejection.
      Promise.allSettled(ends).then(() => layer.remove());
      return 260 + 34 * steps;
    },
  };
}

/** Drops every copy, made or pending, and ends the bends. */
wash.clear = (): void => {
  pending = null;
  clears += 1;
  stopWave();
  for (const layer of document.querySelectorAll('[data-copy]')) layer.remove();
  endBends();
};

/** Whether a page switch brought the reader here, once: not on a first load. */
export function takeArrival(): boolean {
  const was = arrived;
  arrived = false;
  return was;
}

/** How many ms until the block of a wave that holds `el` is opaque; 0 with no wave. */
export function opaqueIn(el: Element): number {
  for (let block: Element | null = el; block; block = block.parentElement) {
    const condensing = block.getAnimations().find(({ id }) => id === 'condense');
    // By its own clock, which is the frame's, as what starts with it.
    if (condensing) return Math.max(0, condensing.effect!.getTiming().delay! + 190 - (condensing.currentTime as number));
  }
  return 0;
}

/** The wave of a page switch: the old page's copy washes away behind the front, and the new page's blocks condense once
 * it has passed, those added meanwhile included; with the link a run was opened by, the run's title travels from it. */
function wave(main: HTMLElement, source: DOMRect, copy: HTMLElement | null, link: { size: number } | null): void {
  prepared = true;
  const { x, y } = centre(source);
  const front: Front = { x, y, R: reach(x, y) * 1.05, ms: 900, pow: 1.8 };
  const start = performance.now();
  const layer = copy && attach('page', [copy]);
  const seen = new Set<Element>();
  let title: Element | null = null;
  const gather = (els: Element[]) => {
    const moving: (Animation | null)[] = [];
    if (link && !title) {
      title = main.querySelector('h1');
      if (title) moving.push(travel(title, source, link.size));
    }
    const fresh = els.filter((el) => !seen.has(el) && !(title && el.contains(title))).map((el) => [el, el.getBoundingClientRect()] as const);
    for (const [el, r] of fresh) {
      seen.add(el);
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + Math.min(r.height, innerHeight) / 2);
      const distance = Math.hypot(dx, dy) || 1;
      // React Flow measures its boxes in window pixels when they mount, so a block holding one isn't scaled.
      const scale = el.querySelector('.react-flow') ? '' : ' scale(0.9)';
      moving.push(condense(el, {
        ms: 640,
        from: `translate(${(dx / distance) * 34}px, ${(dy / distance) * 34}px)${scale}`,
        delay: Math.max(0, reaches(distance + 0.15 * r.width, front) - (performance.now() - start)),
        origin: 'center',
      }));
    }
    clip(moving);
  };

  const watch = new MutationObserver((records) => {
    // What is added inside a panel is no block.
    const added = records.filter(({ target }) => !(target as Element).closest(PANEL)).flatMap(({ addedNodes }) => [...addedNodes]);
    if (added.length > 0) gather(blocks(main).filter((el) => added.some((node) => node.contains(el))));
  });
  const stop = () => {
    watch.disconnect();
    layer?.remove();
    // It holds the old page's copy.
    if (stopWave === stop) stopWave = () => {};
  };
  setTimeout(stop, front.ms);
  stopWave = stop;
  drop(x, y, { ...front, amp: 1.4, train: 150 });
  // The cut goes with its last frame, so the copy goes then too and never shows whole.
  if (layer) bend(copy!, front, 'wash', () => layer.remove());
  gather(blocks(main));
  watch.observe(main, { childList: true, subtree: true });
}

/** Runs the filters and the shader unseen, so the first switch doesn't stall. */
function prepare(main: HTMLElement): void {
  // Not while a wave bends, which this would end: at the next idle moment, then.
  if (prepared || bending() || !motionRuns()) return;
  prepared = true;
  warm();
  if (!wide()) return;
  const copy = pageCopy(main);
  const layer = attach('prepare', [copy]);
  layer.style.opacity = '0.01';
  bend(copy, { x: 60, y: 60, R: 900, ms: 300, pow: 1.8 }, 'wash', () => layer.remove());
}

// Safari has no idle callback.
const whenIdle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 800));
const cancelIdle = window.cancelIdleCallback ?? clearTimeout;

/** The page switch: on a new path the old page washes away from where the reader pressed and the new one condenses.
 * Returns the filters, for the shell to draw. */
export function useWash(main: RefObject<HTMLElement | null>): ReactNode {
  const router = useRouter();
  useEffect(() => {
    const subscriptions = [
      router.subscribe('onBeforeLoad', ({ fromLocation, pathChanged }) => {
        const at = performance.now();
        pending = null;
        if (fromLocation && pathChanged && motionRuns()) {
          pending = { at, copy: wide() ? pageCopy(main.current!) : null };
        } else {
          // A press is for its own load only.
          sourceOf(at);
        }
      }),
      router.subscribe('onResolved', () => {
        const resolved = pending;
        // `onRendered` follows at once and takes it, unless the load ended without a new page.
        queueMicrotask(() => {
          if (pending === resolved) pending = null;
        });
      }),
      router.subscribe('onRendered', ({ fromLocation, toLocation, pathChanged }) => {
        if (fromLocation && pathChanged) arrived = true;
        const switched = pending;
        if (!switched) return;
        wash.clear();
        if (!motionRuns()) return;
        const { rect, link } = sourceOf(switched.at);
        wave(main.current!, rect, switched.copy, toLocation.pathname.startsWith('/runs/') ? link : null);
      }),
    ];
    return () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      wash.clear();
    };
  }, [router, main]);

  const idle = useIsFetching() === 0;
  useEffect(() => {
    if (!idle) return;
    const id = whenIdle(() => prepare(main.current!));
    return () => cancelIdle(id);
  }, [idle, main]);

  return createElement(Filters);
}
