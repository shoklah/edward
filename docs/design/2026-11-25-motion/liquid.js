// The liquid glass set: four verbs (melt, inflate, ripple, flow) over the same mockup. Loaded before motion.js.
const RAIL_SWITCH = ['drops', 'drop'];
/** A damped spring as a linear() easing: `z` near 1 is stiff, near 0.4 is jelly. */
function spring(z, n = 40) {
  const w = 5.8 / z, d = w * Math.sqrt(1 - z * z);
  return `linear(${Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return i === n ? 1 : (1 - Math.exp(-z * w * t) * (Math.cos(d * t) + ((z * w) / d) * Math.sin(d * t))).toFixed(4); }).join(',')})`;
}
const FIRM = spring(0.75), SOFT = spring(0.55), JELLY = spring(0.38);
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="melt" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.009 0.0009" numOctaves="1" seed="7" result="n"/>
  <feColorMatrix in="n" values="0 0 0 0 0.5  1.5 0 0 0 -0.45  0 0 0 0 0  0 0 0 0 1" result="m"/>
  <feDisplacementMap in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
const meltMap = document.querySelector('#melt feDisplacementMap');

const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
const panels = () => [...main.querySelectorAll('.glass')].filter((p) => visible(p) && !p.parentElement.closest('.glass')).slice(0, 16);

/** The page switch: an inert copy of the old page melts, the new one, live at once, inflates out of the rail entry pressed. */
function liquidSwitch(mode, p, change) {
  const a = document.querySelector(`aside nav a[data-page="${railOf(p)}"]`).getBoundingClientRect();
  const src = a.width ? a : { left: 12, top: 12, width: 60, height: 36 };
  const cx = src.left + src.width / 2, cy = src.top + src.height / 2;
  melt(320);
  change();
  const M = main.getBoundingClientRect();
  if (mode === 'drops') {
    const far = Math.hypot(innerWidth, innerHeight), fresh = panels();
    for (const el of fresh) {
      const r = el.getBoundingClientRect(), dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      const s = Math.min(0.3, Math.max(0.06, src.height / Math.max(r.height, 60)));
      play(el, [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${Math.min(s * 1.4, 0.4)}, ${s})` }, { opacity: 1, offset: 0.14 }, { opacity: 1, transform: 'none' }], 560, { delay: 80 + (Math.hypot(dx, dy) / far) * 170, easing: FIRM });
    }
    // What isn't on a panel (the title, the filters, bare text) condenses in place.
    for (const el of loose(fresh)) play(el, [{ opacity: 0, transform: 'translateY(-8px)' }, {}], 240, { delay: 200 });
  } else {
    const el = main, h = innerHeight - Math.max(0, M.top);
    el.style.transformOrigin = '0 0';
    play(el, [
      { opacity: 0, transform: `translate(${src.left - M.left}px, ${src.top - M.top}px) scale(${src.width / M.width}, ${src.height / h})`, clipPath: `inset(0 0 ${Math.max(0, M.height - h)}px 0 round 320px)` },
      { opacity: 1, offset: 0.1 }, { clipPath: `inset(0 0 ${Math.max(0, M.height - h)}px 0 round 60px)`, offset: 0.6 },
      { opacity: 1, transform: 'none', clipPath: `inset(0 0 ${Math.max(0, M.height - h)}px 0 round 0px)` },
    ], 600, { delay: 90, easing: FIRM });
  }
}
/** The page's blocks that hold no panel: the smallest set that covers what `fresh` doesn't. */
function loose(fresh) {
  const out = [], walk = (el) => { for (const c of el.children) { if (fresh.includes(c)) continue; if (fresh.some((f) => c.contains(f))) walk(c); else if (visible(c)) out.push(c); } };
  walk(main); return out.slice(0, 16);
}
/** A copy of the page in a layer no bigger than the window, running down the glass. */
function melt(ms) {
  document.querySelector('.m-melt')?.remove();
  const r = main.getBoundingClientRect(), layer = document.createElement('div'), copy = main.cloneNode(true);
  layer.className = 'm-melt'; layer.ariaHidden = 'true'; layer.inert = true;
  copy.removeAttribute('id'); for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
  Object.assign(copy.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0 });
  layer.append(copy); document.body.append(layer);
  const from = main.querySelectorAll('[data-scroll-cue]'), to = copy.querySelectorAll('[data-scroll-cue]');
  from.forEach((el, i) => { if (to[i]) { to[i].scrollTop = el.scrollTop; to[i].scrollLeft = el.scrollLeft; } });
  play(layer, [{ opacity: 1, transform: 'none' }, { opacity: 0.75, offset: 0.3 }, { opacity: 0, transform: 'translateY(90px)' }], ms, { easing: 'linear', fill: 'both' }).finished.finally(() => layer.remove());
  const t0 = performance.now();
  const tick = (t) => { const f = Math.min(1, Math.max(0, t - t0) / (ms * k)); meltMap.setAttribute('scale', (f * 420).toFixed(1)); if (f < 1 && layer.isConnected) requestAnimationFrame(tick); else meltMap.setAttribute('scale', 0); };
  requestAnimationFrame(tick);
}
function rim(x, y, R, ms, delay = 0) {
  const el = Object.assign(document.createElement('div'), { className: 'm-rim', ariaHidden: 'true' });
  el.style.left = `${x}px`; el.style.top = `${y}px`; html.append(el);
  const s = (2 * R) / 600;
  play(el, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(0)' }, { opacity: 0.9, offset: 0.7 }, { opacity: 0, transform: `translate(-50%, -50%) scale(${s})` }], ms, { delay, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }).finished.finally(() => el.remove());
}

/** An import lands: a drop hits the "Imported" line and the wave runs through the page, each thing answering as it passes. */
let wave = null;
function ripple() {
  const r = document.querySelector('#imported').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(innerWidth - x, y) * 1.05;
  wave = { x, y, delay: (el) => { const b = el.getBoundingClientRect(); return (Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y) / R) * 620; } };
  rim(x, y, R, 820); setTimeout(() => rim(x, y, R * 0.8, 760), 130 * k);
  const line = document.querySelector('#imported');
  play(line, [{ transform: 'scale(0.9, 1.2)' }, { transform: 'none' }], 520, { easing: JELLY });
  for (const el of panels()) {
    const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - x, dy = b.top + b.height / 2 - y, d = Math.hypot(dx, dy) || 1;
    play(el, [{ transform: 'none' }, { transform: `translate(${((dx / d) * 5).toFixed(1)}px, ${((dy / d) * 5).toFixed(1)}px) scale(1.006)`, offset: 0.25, easing: JELLY }, { transform: 'none' }], 620, { delay: wave.delay(el) });
  }
}
/** A changed value: the old one melts off, the new one condenses inside a drop of glass that then evaporates. */
function condense(el, old, now) {
  const inner = document.createElement('span'); inner.className = 'm-drop';
  inner.innerHTML = `<i aria-hidden="true"></i><span class="old" aria-hidden="true">${old}</span><span class="new">${now}</span>`;
  el.replaceChildren(inner);
  const [bubble, was, is] = inner.children, delay = wave ? wave.delay(el) : 0;
  play(was, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(0.7em) scale(0.8, 1.5)' }], 220, { delay, fill: 'both', easing: 'ease-in' });
  play(is, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: 'none' }], 620, { delay: delay + 110, fill: 'both', easing: JELLY });
  play(bubble, [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1.12, 0.94)', offset: 0.12 }, { opacity: 1, transform: 'scale(0.97, 1.04)', offset: 0.22 }, { opacity: 1, transform: 'none', offset: 0.32 }, { opacity: 1, transform: 'none', offset: 0.72 }, { opacity: 0, transform: 'scale(1.25)' }], 1500, { delay: delay + 40, fill: 'both', easing: 'ease-out' });
  setTimeout(() => { if (el.contains(inner)) el.textContent = now; }, (delay + 1650) * k);
}
/** A pill or ring flows from one place to the next: it stretches over the gap, then gathers. */
function gather(el, from, to, size, ms = 420) {
  const gap = Math.abs(to.y - from.y) + Math.abs(to.x - from.x), sy = 1 + Math.min(Math.abs(to.y - from.y), 160) / size.h * 0.55, sx = 1 + Math.min(Math.abs(to.x - from.x), 200) / size.w * 0.5;
  if (!gap) return;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2, T = (x, y, a = 1, b = 1) => `translate(${x}px, ${y}px) scale(${a}, ${b})`;
  play(el, [{ transform: T(from.x, from.y) }, { transform: T(mx, my, sx > 1.02 ? sx : 0.9, sy > 1.02 ? sy : 0.9), offset: 0.3, easing: SOFT }, { transform: T(to.x, to.y) }], ms, { easing: 'ease-in' });
}
