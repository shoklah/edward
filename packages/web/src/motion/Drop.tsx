import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { centre } from './place.ts';
import { JELLY, play } from './play.ts';
import { drop as fall } from './water.ts';

/** A small ripple of light: a changed number's own, and the one of an import that changed nothing in the window. */
export const SMALL = { R: 110, ms: 1300, amp: 0.75, pow: 1.6, train: 60 };

/** A changed number: its old look stands over it for `delay` ms, until the front is there, then melts off as the new one
 * forms inside a drop of glass that evaporates; without `drop` the two swap at once. Nothing around it moves: the glass
 * and the old number stand in the room its cell leaves, clipped to the cell. */
export function Drop({ old, children, delay, drop, onDone }: { old: string; children: ReactNode; delay: number; drop: boolean; onDone: () => void }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    const [was, is] = [...el.querySelectorAll<HTMLElement>(':scope > span')];
    const glass = el.querySelector('i');
    const cell = el.closest('td, th, dd, button') ?? el;
    const [inner, outer] = [el, cell].map((e) => e.getBoundingClientRect());
    const gx = Math.max(0, Math.min(inner.left - outer.left, outer.right - inner.right));
    const gy = Math.max(0, Math.min(inner.top - outer.top, outer.bottom - inner.bottom));
    el.style.padding = `${gy}px ${gx}px`;
    el.style.margin = `${-gy}px ${-gx}px`;
    if (glass) glass.style.inset = `${gy - Math.min(3, gy / 2)}px ${gx - Math.min(11, gx / 2)}px`;
    // The old number stands where it stood, whatever its width.
    const align = getComputedStyle(cell).textAlign;
    was.style.top = `${gy}px`;
    if (align === 'center') [was.style.left, was.style.translate] = ['50%', '-50%'];
    else was.style[align === 'right' || align === 'end' ? 'right' : 'left'] = `${gx}px`;

    const at = (ms: number, easing: string) => ({ delay: delay + ms, easing, fill: 'both' }) as const;
    const animations = glass
      ? [
          play('ripple', was, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(0.7em) scale(0.8, 1.5)' }], 374, at(0, 'ease-in')),
          play('ripple', is, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: 'none' }], 1054, at(187, JELLY)),
          play(
            'ripple',
            glass,
            [
              { opacity: 0, transform: 'scale(0.2)' },
              { opacity: 1, transform: 'scale(1.12, 0.94)', offset: 0.12 },
              { opacity: 1, transform: 'scale(0.97, 1.04)', offset: 0.22 },
              { opacity: 1, transform: 'none', offset: 0.32 },
              { opacity: 1, transform: 'none', offset: 0.72 },
              { opacity: 0, transform: 'scale(1.12)' },
            ],
            2550,
            at(40, 'ease-out'),
          ),
        ]
      : [play('ripple', was, [{ opacity: 1 }, { opacity: 0 }], 1, at(0, 'step-end')), play('ripple', is, [{ opacity: 0 }, { opacity: 1 }], 1, at(0, 'step-end'))];
    const last = animations.at(-1);
    if (!last) {
      onDone();
      return;
    }
    last.onfinish = onDone;
    const ripple = window.setTimeout(() => {
      const { x, y } = centre(el.getBoundingClientRect());
      if (glass) fall(x, y, SMALL);
    }, delay + 60);
    return () => {
      clearTimeout(ripple);
      for (const animation of animations) animation?.cancel();
      el.removeAttribute('style');
    };
  }, []);
  return (
    <span ref={box} data-drop={drop ? 'drop' : 'swap'} className="relative inline-block overflow-clip">
      {drop && <i aria-hidden className="pointer-events-none absolute drop-glass" />}
      <span aria-hidden className="absolute whitespace-nowrap">
        {old}
      </span>
      <span className="relative inline-block">{children}</span>
    </span>
  );
}
