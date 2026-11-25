import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { StatusResponse } from '@cwd/shared';
import { bend } from './bend.ts';
import { clip } from './clip.ts';
import { Drop, SMALL } from './Drop.tsx';
import { centre, importSource, inWindow, reach } from './place.ts';
import { JELLY, motionRuns, play } from './play.ts';
import { drop } from './water.ts';
import { frontAt, panelsOf } from './wash.ts';

/** What a commit changed: the front's delay is measured at `at`. With `counts` false it starts no wave, and lands only in
 * one something else starts; a `number` may get one of the wave's drops. */
type Item = { at: Element; counts: boolean; number: boolean; land: (delay: number, drop: boolean) => void };

/** What this commit noticed, and the import whose data it drew. Both are settled before it is painted. */
let noticed: Item[] = [];
let landed: string | null = null;
let settling = false;

/** The last wave: its import, its front (for what it delays) and how many numbers got a drop. */
let wave: { of: string; x: number; y: number; R: number; ms: number; pow: number; start: number; drops: number } | null = null;
const MOST_DROPS = 9;

function settleSoon(): void {
  if (settling) return;
  settling = true;
  queueMicrotask(settle);
}

/** Tells that a commit changed `item`, to land if the commit also draws an import's data. */
export function notice(item: Item): void {
  noticed.push(item);
  settleSoon();
}

/** Whether the reader is neither in a dialog nor choosing nor typing. */
function free(): boolean {
  return !document.querySelector('[role="dialog"]') && !document.activeElement?.matches('select, textarea, input:not([type="checkbox"])');
}

/** Settles a commit: what it noticed in the window lands in its import's wave, which the first of it starts; with no
 * landing, what it noticed is forgotten. */
function settle(): void {
  const [items, of] = [noticed, landed];
  [noticed, landed, settling] = [[], null, false];
  if (of === null || !motionRuns() || !free()) return;
  const shown = items.filter(({ at }) => inWindow(at));
  if (wave?.of !== of) {
    if (!shown.some(({ counts }) => counts)) return;
    wave = startWave(of);
  }
  const front = wave;
  const numbers = shown.filter(({ number }) => number);
  const left = Math.min(MOST_DROPS - front.drops, numbers.length);
  front.drops += left;
  const dropping = Array.from({ length: left }, (_, i) => numbers[Math.floor((i * numbers.length) / left)]);
  flushSync(() => {
    for (const item of shown) {
      const to = centre(item.at.getBoundingClientRect());
      const delay = frontAt(Math.hypot(to.x - front.x, to.y - front.y), front) - (performance.now() - front.start);
      item.land(Math.max(0, delay), dropping.includes(item));
    }
  });
}

/** An import's wave: a drop hits its source, the page bends under it and each panel bobs as it passes. */
function startWave(of: string): NonNullable<typeof wave> {
  const { x, y } = importSource();
  const front = { x, y, R: reach(x, y) * 1.05, ms: 2000, pow: 1.35 };
  const { R, pow } = front;
  drop(x, y, { R, ms: 2240, amp: 1.5, pow, train: 230 });
  setTimeout(() => drop(x, y, { R: R / 2, ms: 1600, amp: 0.8, pow, train: 120 }), 420);
  const line = document.querySelector('[data-imported]');
  if (line) play('ripple', line, [{ transform: 'scale(0.86, 1.3)' }, { transform: 'none' }], 900, { easing: JELLY });
  const main = document.getElementById('main');
  if (main) {
    // Until the last panel's bob is over.
    clip(new Promise((end) => setTimeout(end, front.ms + 1200)));
    if (!document.querySelector('[data-copy="page"]')) bend(main, { ...front, ms: 2240 }, 'bend');
    for (const panel of panelsOf(main)) {
      const to = centre(panel.getBoundingClientRect());
      const [dx, dy] = [to.x - x, to.y - y];
      const distance = Math.hypot(dx, dy) || 1;
      const away = `translate(${(dx / distance) * 8}px, ${(dy / distance) * 8}px) scale(1.007, 0.996)`;
      play('ripple', panel, [{ transform: 'none' }, { transform: away, offset: 0.25, easing: JELLY }, { transform: 'none' }], 1200, {
        delay: Math.max(0, frontAt(distance, front) - 120),
      });
    }
  }
  return { of, ...front, start: performance.now(), drops: 0 };
}

/** Calls `land` in the commit that first draws a later import than the last one drawn for the same `key` and viewed
 * account. `drawn` is undefined with no data, which, as no status does, starts afresh; placeholder data isn't drawn. */
function useLater(key: string, status: StatusResponse | undefined, drawn: boolean | undefined, land: (at: string) => void): void {
  const last = useRef<{ of: string; at: string } | null>(null);
  const of = JSON.stringify([key, status?.account?.viewing ?? null]);
  const known = status !== undefined && drawn !== undefined;
  const at = drawn ? status?.lastGoodImportAt : null;
  useLayoutEffect(() => {
    if (!known) last.current = null;
    if (!at) return;
    const was = last.current;
    last.current = { of, at };
    if (was?.of === of && at > was.at) land(at);
  }, [known, of, at]);
}

/** An import's data landed: `path`'s, `drawn` (false while it is placeholder data, undefined while there is none). */
export function useLanding(path: string, status: StatusResponse | undefined, drawn: boolean | undefined): void {
  useLater(path, status, drawn, (at) => {
    landed = at;
    settleSoon();
  });
}

/** Answers every import: the eye blinks and, once nothing is fetching, a small ripple plays if no wave did. */
export function useImports(status: StatusResponse | undefined): void {
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const unanswered = useRef<string | null>(null);
  useLater('', status, true, (at) => {
    unanswered.current = at;
    for (const eye of document.querySelectorAll('[data-eye]')) {
      const shut = 'scaleY(0.08)';
      play('ripple', eye, [{}, { transform: shut, offset: 0.45 }, { transform: shut, offset: 0.55 }, {}], 260, { easing: 'ease-in-out' });
    }
  });
  useEffect(() => {
    if (!status) unanswered.current = null;
    const at = unanswered.current;
    // Asked again, since this commit's own queries may have just started.
    if (at === null || queryClient.isFetching() > 0) return;
    unanswered.current = null;
    // After this commit's landing is settled.
    queueMicrotask(() => {
      if (wave?.of === at) return;
      const { x, y } = importSource();
      drop(x, y, SMALL);
    });
  }, [status, fetching, queryClient]);
}

/** A number's text, for its one element: `children` is `shown` (its `text`) and, while an import's wave changes it, a
 * `Drop` from its old text. */
export function useRipple<E extends HTMLElement>(text: string, shown: ReactNode = text): { ref: RefObject<E | null>; children: ReactNode } {
  const ref = useRef<E>(null);
  const drawn = useRef(text);
  const [dropping, setDropping] = useState<{ old: string; delay: number; drop: boolean } | null>(null);
  useLayoutEffect(() => {
    const old = drawn.current;
    if (old === text) return;
    drawn.current = text;
    setDropping(null);
    if (ref.current) notice({ at: ref.current, counts: true, number: true, land: (delay, drop) => setDropping({ old, delay, drop }) });
  }, [text]);
  return { ref, children: dropping ? createElement(Drop, { ...dropping, onDone: () => setDropping(null), children: shown }) : shown };
}
