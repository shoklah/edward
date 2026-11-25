import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { finish, motionOn, played } from '../test/motion.ts';
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

test('a copy keeps what the reader saw: a picked option, a ticked box, scrolled regions, and no id, filter, drop or password', () => {
  document.body.innerHTML = `
    <main id="main" style="width: 300px; filter: blur(1px)">
      <select id="s"><option>a</option><option>b</option><option>c</option></select>
      <input id="t" type="checkbox">
      <input type="password" value="typed">
      <div data-scroll-cue style="width: 100px; height: 30px; overflow: auto"><div style="width: 400px">wide</div></div>
      <span data-drop><i aria-hidden></i><span aria-hidden>1</span><span>2</span></span>
    </main>`;
  const main = document.querySelector('main')!;
  main.querySelector('select')!.selectedIndex = 2;
  main.querySelector<HTMLInputElement>('[type=checkbox]')!.checked = true;
  main.querySelector<HTMLInputElement>('[type=password]')!.value = 'typed on';
  main.querySelector('[data-scroll-cue]')!.scrollLeft = 40;
  const at = main.getBoundingClientRect();
  const layer = attach('page', at, [copyOf(main)]);
  const copy = layer.firstElementChild as HTMLElement;
  expect(copy.querySelector('select')!.selectedIndex).toBe(2);
  expect(copy.querySelector<HTMLInputElement>('[type=checkbox]')!.checked).toBe(true);
  expect(copy.querySelector<HTMLInputElement>('[type=password]')!.value).toBe('');
  expect(copy.outerHTML).not.toContain('typed');
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

test('a copy keeps the ids its own url() references point to, renamed, so its gradients and arrowheads are drawn', () => {
  document.body.innerHTML = `
    <svg><marker id="outside"></marker></svg>
    <main id="main">
      <svg>
        <defs><linearGradient id="fade"></linearGradient><marker id=":r1:-arrow"></marker><marker id="unused"></marker></defs>
        <path stroke="url(#fade)" marker-end="url(#:r1:-arrow)" style="marker-start: url('#:r1:-arrow')"></path>
        <path id="named" marker-end="url(#outside)"></path>
      </svg>
    </main>`;
  const copy = copyOf(document.querySelector('main')!);
  expect([copy, ...copy.querySelectorAll('[id]')].map((el) => el.id).filter(Boolean)).toEqual(['copy-fade', 'copy-:r1:-arrow']);
  const [path, other] = copy.querySelectorAll('path');
  expect([path.getAttribute('stroke'), path.getAttribute('marker-end')]).toEqual(['url(#copy-fade)', 'url(#copy-:r1:-arrow)']);
  expect(path.style.markerStart).toBe('url("#copy-:r1:-arrow")');
  expect(other.getAttribute('marker-end')).toBe('url(#outside)');
});

test('clear drops every copy', () => {
  const el = document.body.appendChild(document.createElement('p'));
  for (const kind of ['page', 'items', 'prepare'] as const) attach(kind, el.getBoundingClientRect(), [copyOf(el)]);
  expect(document.querySelectorAll('[data-copy]')).toHaveLength(3);
  wash.clear();
  expect(document.querySelectorAll('[data-copy]')).toHaveLength(0);
  expect(el.isConnected).toBe(true);
});

describe('items that leave a list', () => {
  let on: { mockRestore(): void };
  beforeEach(async () => {
    await page.viewport(1000, 600);
    on = motionOn();
    document.body.innerHTML = `
      <div style="height: 2000px">
        <section class="glass" style="position: absolute; left: 60px; top: 150px; width: 300px; padding: 10px; font: 14px / 20px serif">
          <div data-scroll-cue style="height: 100px; overflow: hidden; mask-image: linear-gradient(black, transparent)">
            <ul style="margin: 0; padding: 0">${[...'abcd'].map((key) => `<li id="${key}" style="height: 40px; list-style: none">${key}</li>`).join('')}</ul>
          </div>
        </section>
      </div>`;
  });
  afterEach(() => {
    on.mockRestore();
    window.scrollTo(0, 0);
  });

  const list = () => document.querySelector('ul')!;
  const press = () => wash(list(), [...'abcd']);
  const layer = () => document.querySelector<HTMLElement>('[data-copy="items"]');
  const copies = () => [...(layer()?.children ?? [])] as HTMLElement[];
  const rect = (el: Element) => el.getBoundingClientRect().toJSON();

  test('wash away over it once told which remain, the last first, where its panel now is', async () => {
    const seen = press();
    expect(document.querySelector('[data-copy]')).toBeNull();
    window.scrollTo(0, 100);
    seen.left(['b']);
    const all = layer()!;
    expect(copies().map((el) => el.textContent)).toEqual(['a', 'c']);
    expect(rect(all)).toEqual(rect(document.querySelector('[data-scroll-cue]')!));
    expect(all.getBoundingClientRect().top).toBe(60);
    expect(copies().map(rect)).toEqual([...'ac'].map((key) => rect(document.getElementById(key)!)));
    expect([all.inert, all.ariaHidden]).toEqual([true, 'true']);
    const style = getComputedStyle(all);
    expect(style).toMatchObject({ position: 'fixed', zIndex: 'auto', overflow: 'hidden', pointerEvents: 'none' });
    expect(style.maskImage).toBe('linear-gradient(rgb(0, 0, 0), rgba(0, 0, 0, 0))');
    expect(getComputedStyle(copies()[0]).font).toBe('14px / 20px serif');
    expect(all.querySelectorAll('[id]')).toHaveLength(0);

    expect(played(all)).toEqual(copies().map((el) => ({ verb: 'wash', ms: 260, el })));
    const [first, last] = copies().map((el) => el.getAnimations()[0]);
    expect([first, last].map(({ effect }) => effect!.getTiming().delay)).toEqual([34, 0]);
    expect(first.effect!.getTiming()).toMatchObject({ easing: 'ease-in', fill: 'both' });
    expect((first.effect as KeyframeEffect).getKeyframes().map(({ computedOffset, opacity, transform }) => [computedOffset, opacity, transform])).toEqual([
      [0, '1', undefined],
      [0.4, '0.9', 'translateY(6px) scale(0.99, 1.08)'],
      [1, '0', 'translateY(46px) scale(0.86, 1.35)'],
    ]);
    last.finish();
    await last.finished;
    expect(all.isConnected).toBe(true);
    first.finish();
    await vi.waitFor(() => expect(layer()).toBeNull());
  });

  test('say how long they take, and what condenses after them shows in no frame that still has one', async () => {
    expect(press().left([...'abcd'])).toBe(0);
    const line = document.body.appendChild(document.createElement('p'));
    const ms = press().left([]);
    expect(ms).toBe(260 + 2 * 34);
    condense(line, { delay: ms });
    const shown: number[] = [];
    while (layer()) {
      shown.push(Number(getComputedStyle(line).opacity));
      await new Promise(requestAnimationFrame);
    }
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter(Boolean)).toEqual([]);
  });

  test('follow one another by 34 ms, at most 272, those nearest the foot together', () => {
    const keys = [...'abcdefghijkl'];
    document.querySelector<HTMLElement>('[data-scroll-cue]')!.style.height = '300px';
    list().innerHTML = keys.map((key) => `<li style="height: 20px; list-style: none">${key}</li>`).join('');
    expect(wash(list(), keys).left([])).toBe(532);
    expect(copies().map((el) => el.getAnimations()[0].effect!.getTiming().delay)).toEqual([272, 238, 204, 170, 136, 102, 68, 34, 0, 0, 0, 0]);
  });

  test('that is gone wash away from their own places, only those that were in the window', () => {
    const rects = [...'abc'].map((key) => rect(document.getElementById(key)!));
    const seen = press();
    document.querySelector('[data-scroll-cue]')!.replaceWith('Nothing new.');
    seen.left([]);
    expect(copies().map(rect)).toEqual(rects);
  });

  test('never make the page scroll', () => {
    const size = () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
    const rest = size();
    document.querySelector<HTMLElement>('section')!.style.left = '750px';
    const seen = press();
    seen.left([]);
    for (let ms = 0; ms <= 360; ms += 20) {
      for (const animation of layer()!.getAnimations({ subtree: true })) animation.currentTime = ms;
      expect(size()).toEqual([Math.max(rest[0], 1070), rest[1]]);
    }
  });

  test('leave nothing when cut short', async () => {
    press().left([]);
    for (const el of copies()) el.getAnimations()[0].cancel();
    await vi.waitFor(() => expect(layer()).toBeNull());
  });

  test('leave nothing when all remain', () => {
    press().left([...'abcd']);
    expect(layer()).toBeNull();
  });

  test('leave nothing once cleared, before they leave or as they do', () => {
    const seen = press();
    wash.clear();
    expect(seen.left([])).toBe(0);
    expect(layer()).toBeNull();
    press().left([]);
    expect(copies()).toHaveLength(3);
    wash.clear();
    expect(layer()).toBeNull();
  });

  test('leave nothing with motion off at the press or when they leave, nor under 768 px', async () => {
    const seen = press();
    on.mockRestore();
    expect(seen.left([])).toBe(0);
    expect(layer()).toBeNull();
    const still = press();
    on = motionOn();
    expect(still.left([])).toBe(0);
    expect(layer()).toBeNull();
    await page.viewport(767, 600);
    expect(press().left([])).toBe(0);
    expect(layer()).toBeNull();
    await page.viewport(768, 600);
    press().left([]);
    expect(copies()).toHaveLength(3);
    finish(document.body);
  });
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
