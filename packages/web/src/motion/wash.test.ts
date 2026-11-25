import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { motionOn, played } from '../test/motion.ts';
import { condense } from './condense.ts';
import { centre, sourceOf } from './place.ts';
import { FIRM } from './play.ts';
import { attach, copyOf, frontAt, wash } from './wash.ts';

afterEach(() => document.body.replaceChildren());

describe('the source of a wave', () => {
  const stay = (event: Event) => event.preventDefault();
  beforeEach(() => {
    sourceOf(0);
    document.body.innerHTML = `
      <aside><nav><a href="/weeks">Weeks</a> <a href="/work" aria-current="page">Work</a></nav></aside>
      <header><button aria-haspopup="dialog" style="position: absolute; left: 500px; top: 10px">Menu</button></header>
      <main id="main"><a href="/runs/1" style="font-size: 23px">A run</a></main>
      <div role="dialog"><a href="/spend">Spend</a></div>`;
    document.addEventListener('click', stay);
  });
  afterEach(() => document.removeEventListener('click', stay));

  const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;
  const rectOf = (selector: string) => el(selector).getBoundingClientRect().toJSON();
  const source = (now = performance.now()) => {
    const { rect, link } = sourceOf(now);
    return { rect: rect.toJSON(), link };
  };
  const RAIL = 'nav [aria-current]';

  test('is the link pressed less than a second ago, inside the page with its font size', () => {
    el('main a').click();
    expect(source()).toEqual({ rect: rectOf('main a'), link: { size: 23 } });
    el('nav a').click();
    expect(source()).toEqual({ rect: rectOf('nav a'), link: null });
  });

  test('is where the link was when it was pressed', () => {
    const at = rectOf('main a');
    el('main a').click();
    el('main').style.paddingTop = '100px';
    expect(source().rect).toEqual(at);
  });

  test('is the link once only: the next load, a Back, starts at the rail', () => {
    el('main a').click();
    source();
    expect(source()).toEqual({ rect: rectOf(RAIL), link: null });
  });

  test("is the rail's current entry when the press is a second old, or was in the Menu dialog", () => {
    el('main a').click();
    expect(source(performance.now() + 1000)).toEqual({ rect: rectOf(RAIL), link: null });
    el('[role=dialog] a').click();
    expect(source()).toEqual({ rect: rectOf(RAIL), link: null });
  });

  test('is the Menu button when the rail is hidden, and the top left when neither shows', () => {
    el('aside').style.display = 'none';
    expect(source()).toEqual({ rect: rectOf('header button'), link: null });
    el('header').style.display = 'none';
    expect(centre(sourceOf(performance.now()).rect)).toEqual({ x: 42, y: 30 });
  });
});

test('the front reaches the source at once and the far corner before it is done', () => {
  const front = { R: 1000, ms: 900, pow: 1.8 };
  expect(frontAt(0, front)).toBe(0);
  expect(frontAt(2000, front)).toBeCloseTo((1 - 0.03 ** (1 / 1.8)) * 900);
});

test('a copy keeps what the reader saw: a picked option, a ticked box, scrolled regions, and no id, filter or drop', () => {
  document.body.innerHTML = `
    <main id="main" style="width: 300px; filter: blur(1px)">
      <select id="s"><option>a</option><option>b</option><option>c</option></select>
      <input id="t" type="checkbox">
      <div data-scroll-cue style="width: 100px; height: 30px; overflow: auto"><div style="width: 400px">wide</div></div>
      <span data-drop><i aria-hidden></i><span aria-hidden>1</span><span>2</span></span>
    </main>`;
  const main = document.querySelector('main')!;
  main.querySelector('select')!.selectedIndex = 2;
  main.querySelector<HTMLInputElement>('[type=checkbox]')!.checked = true;
  main.querySelector('[data-scroll-cue]')!.scrollLeft = 40;
  const at = main.getBoundingClientRect();
  const layer = attach('page', at, [copyOf(main)]);
  const copy = layer.firstElementChild as HTMLElement;
  expect(copy.querySelector('select')!.selectedIndex).toBe(2);
  expect(copy.querySelector<HTMLInputElement>('[type=checkbox]')!.checked).toBe(true);
  expect(copy.querySelector('[data-scroll-cue]')!.scrollLeft).toBe(40);
  expect([copy, ...copy.querySelectorAll('*')].filter((el) => el.id)).toEqual([]);
  expect(copy.style.filter).toBe('');
  expect(copy.querySelector('[data-drop]')!.textContent).toBe('2');
  expect(copy.getBoundingClientRect().toJSON()).toEqual(at.toJSON());
  expect(layer.dataset.copy).toBe('page');
  expect(layer.inert).toBe(true);
  expect(layer).toHaveAttribute('aria-hidden', 'true');
  expect(getComputedStyle(layer)).toMatchObject({ position: 'fixed', zIndex: '-1', overflow: 'hidden', pointerEvents: 'none' });
  // The page itself is left as it was.
  expect([main.id, main.style.filter, main.querySelector('[data-drop]')!.textContent]).toEqual(['main', 'blur(1px)', '12']);
});

test('clear drops every copy', () => {
  const el = document.body.appendChild(document.createElement('p'));
  for (const kind of ['page', 'items', 'prepare'] as const) attach(kind, el.getBoundingClientRect(), [copyOf(el)]);
  expect(document.querySelectorAll('[data-copy]')).toHaveLength(3);
  wash.clear();
  expect(document.querySelectorAll('[data-copy]')).toHaveLength(0);
  expect(el.isConnected).toBe(true);
});

test("what condenses plays from its place squeezed and unseen to the element's own state", () => {
  const el = document.body.appendChild(document.createElement('p'));
  condense(el);
  expect(played(document.body)).toEqual([]);
  const on = motionOn();
  condense(el);
  condense(el, { ms: 640, from: 'scale(0.9)', easing: 'linear', delay: 50, origin: 'center' });
  const [plain, set] = el.getAnimations().map(({ effect }) => effect as KeyframeEffect);
  expect(played(document.body).map(({ verb, ms }) => [verb, ms])).toEqual([['condense', 420], ['condense', 640]]);
  // As the browser writes it.
  expect(plain.getTiming()).toMatchObject({ delay: 0, easing: new KeyframeEffect(null, [], { easing: FIRM }).getTiming().easing });
  expect(set.getTiming()).toMatchObject({ delay: 50, easing: 'linear' });
  const frames = (effect: KeyframeEffect) => effect.getKeyframes().map(({ computedOffset, opacity, transform, transformOrigin }) => ({ computedOffset, opacity, transform, transformOrigin }));
  // What a frame leaves out is the element's own.
  expect(frames(plain)).toEqual([
    { computedOffset: 0, opacity: '0', transform: 'scale(0.97, 0.8)', transformOrigin: '0px 0px' },
    { computedOffset: 0.3, opacity: '1' },
    { computedOffset: 1, transformOrigin: '0px 0px' },
  ]);
  expect(frames(set)[0]).toMatchObject({ transform: 'scale(0.9)', transformOrigin: 'center center' });
  on.mockRestore();
});
