// The liquid glass set: four verbs (melt, inflate, ripple, flow) over the same mockup. Loaded before motion.js.
const RAIL_SWITCH = ['drain', 'mercury', 'wash', 'drip'];
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

/** The page switch. Arriving is one thing, panels inflating out of the rail entry pressed; leaving is the choice. */
function liquidSwitch(mode, p, change, was, link) {
  const entry = (q) => { const r = document.querySelector(`aside nav a[data-page="${railOf(q)}"]`)?.getBoundingClientRect(); return r?.width ? r : { left: 12, top: 12, width: 60, height: 36 }; };
  // The wave starts where the reader pressed: the link inside the page, else the rail's entry.
  const at = link?.getBoundingClientRect(), src = at ?? entry(p), from = entry(was), cx = src.left + src.width / 2, cy = src.top + src.height / 2;
  const size = link ? parseFloat(getComputedStyle(link).fontSize) : 0;
  const layer = copyPage(), ghosts = layer.panels;
  change();
  const fresh = panels(), far = Math.hypot(innerWidth, innerHeight);
  // A run's title travels from its link.
  const h1 = at && p === 'run' ? main.querySelector('h1') : null;
  if (h1) travel(h1, at, size);
  if (mode === 'drip') { drip(layer, 320); inflate(fresh, src, 80, 170); settle(fresh, 200); }
  if (mode === 'drain') {
    // The page goes back into the entry it came from, then the pill carries it to the next one.
    const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    layer.loose.forEach((el) => play(el, [{ opacity: 1 }, { opacity: 0 }], 110, { fill: 'both' }));
    ghosts.map((el) => [el, el.getBoundingClientRect()]).forEach(([el, r]) => {
      const dx = fx - (r.left + r.width / 2), dy = fy - (r.top + r.height / 2), near = Math.hypot(dx, dy) / far;
      play(el, [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: `translate(${dx * 0.12}px, ${dy * 0.12}px) scale(0.84, 0.96)`, borderRadius: '60px', offset: 0.4 }, { opacity: 0.9, offset: 0.85 }, { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.08, ${Math.max(0.04, 24 / r.height)})`, borderRadius: '50%' }], 320, { delay: near * 130, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'both' });
    });
    drop(layer, 480); inflate(fresh, src, 300, 170); settle(fresh, 380);
  }
  if (mode === 'mercury') { mercury(layer, ghosts, fresh, src); settle(fresh, 430); }
  if (mode === 'wash') {
    const R = reach(cx, cy) * 1.05, ms = 900, pow = 1.8, when = (d) => (1 - Math.pow(1 - Math.min(0.97, Math.max(0, d / R)), 1 / pow)) * ms;
    drop(layer, ms);
    surface.drip(cx, cy, { R, ms, amp: 1.4, pow, train: 150 });
    if (layer.firstElementChild) bend(layer.firstElementChild, cx, cy, R, ms, pow, 'wash');
    // The new page condenses where the wave has passed.
    for (const el of [...fresh, ...loose(fresh)]) {
      if (el === h1 || el.contains(h1)) continue;
      const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + Math.min(r.height, innerHeight) / 2 - cy, d = Math.hypot(dx, dy) || 1;
      play(el, [{ opacity: 0, transform: `translate(${(-dx / d) * 34}px, ${(-dy / d) * 34}px) scale(0.9)` }, { opacity: 1, offset: 0.3 }, {}], 640, { delay: when(d + 0.15 * r.width), easing: FIRM });
    }
  }
}
function travel(h1, at, size) {
  const to = h1.getBoundingClientRect(), s = size / parseFloat(getComputedStyle(h1).fontSize);
  h1.style.transformOrigin = '0 0'; play(h1, [{ transform: `translate(${at.left - to.left}px, ${at.top - to.top}px) scale(${s})` }, { transform: 'none' }], 620, { easing: FIRM });
}
/** Panels grow out of `src` as drops, the nearest first. */
function inflate(fresh, src, delay, spread) {
  const cx = src.left + src.width / 2, cy = src.top + src.height / 2, far = Math.hypot(innerWidth, innerHeight);
  for (const el of fresh) {
    const r = el.getBoundingClientRect(), dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2), s = Math.min(0.3, Math.max(0.06, src.height / Math.max(r.height, 60)));
    play(el, [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${Math.min(s * 1.4, 0.4)}, ${s})` }, { opacity: 1, offset: 0.14 }, { opacity: 1, transform: 'none' }], 600, { delay: delay + (Math.hypot(dx, dy) / far) * spread, easing: FIRM });
  }
}
function settle(fresh, delay) { for (const el of loose(fresh)) play(el, [{ opacity: 0, transform: 'translateY(-8px)' }, {}], 240, { delay }); }
const reach = (x, y) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
const drop = (layer, ms) => setTimeout(() => layer.remove(), ms * k);
/** An inert copy of the page in a layer no bigger than the window, behind the live one. */
function copyPage() {
  document.querySelector('.m-copy')?.remove();
  const r = main.getBoundingClientRect(), layer = document.createElement('div'), copy = main.cloneNode(true), old = panels(), all = [...main.querySelectorAll('*')], rest = loose(old);
  layer.className = 'm-copy'; layer.ariaHidden = 'true'; layer.inert = true;
  const twins = [...copy.querySelectorAll('*')], twin = (el) => twins[all.indexOf(el)];
  layer.panels = old.map(twin); layer.loose = rest.map(twin);
  copy.removeAttribute('id'); for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
  Object.assign(copy.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0 });
  layer.append(copy); document.body.append(layer);
  const from = main.querySelectorAll('[data-scroll-cue]'), to = copy.querySelectorAll('[data-scroll-cue]');
  from.forEach((el, i) => { if (to[i]) { to[i].scrollTop = el.scrollTop; to[i].scrollLeft = el.scrollLeft; } });
  return layer;
}
/** Panels lose their content, run together as one liquid into the entry pressed, and come back out as the new panels. */
function mercury(layer, ghosts, fresh, src) {
  const goo = document.createElement('div'); goo.className = 'm-goo'; goo.ariaHidden = 'true';
  const cx = src.left + src.width / 2, cy = src.top + src.height / 2, far = Math.hypot(innerWidth, innerHeight);
  const bead = (r) => { const d = document.createElement('i'), h = Math.min(r.bottom, innerHeight + 40) - r.top; Object.assign(d.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${h}px` }); goo.append(d); return [d, cx - (r.left + r.width / 2), cy - (r.top + h / 2), r.width, h]; };
  const olds = ghosts.map((el) => bead(el.getBoundingClientRect())), news = fresh.map((el) => bead(el.getBoundingClientRect()));
  document.body.append(goo);
  play(layer, [{ opacity: 1 }, { opacity: 0 }], 160, { fill: 'both' });
  for (const [d, dx, dy, w, h] of olds) play(d, [{ opacity: 0, transform: 'none', borderRadius: '16px' }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(0.62, 0.66)`, borderRadius: '45%', offset: 0.5 }, { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(${70 / w}, ${44 / h})`, borderRadius: '50%' }], 360, { delay: (Math.hypot(dx, dy) / far) * 70, easing: 'cubic-bezier(0.45, 0, 0.6, 0.8)', fill: 'both' });
  for (const [d, dx, dy, w, h] of news) play(d, [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${70 / w}, ${44 / h})`, borderRadius: '50%' }, { opacity: 1, offset: 0.05 }, { borderRadius: '40%', offset: 0.35 }, { opacity: 1, transform: 'none', borderRadius: '16px' }], 560, { delay: 330 + (Math.hypot(dx, dy) / far) * 120, easing: FIRM, fill: 'both' });
  for (const [i, el] of fresh.entries()) play(el, [{ opacity: 0 }, {}], 280, { delay: 600 + i * 20 });
  play(goo, [{ opacity: 0.8 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0 }], 1060, { fill: 'both', easing: 'linear' }).finished.finally(() => goo.remove());
  drop(layer, 200);
}
/** The page's blocks that hold no panel: the smallest set that covers what `fresh` doesn't. */
function loose(fresh) {
  const out = [], walk = (el) => { for (const c of el.children) { if (fresh.includes(c)) continue; if (fresh.some((f) => c.contains(f))) walk(c); else if (visible(c)) out.push(c); } };
  walk(main); return out.slice(0, 16);
}
/** The page runs down the glass. */
function drip(layer, ms) {
  layer.classList.add('m-melt');
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
  const line = document.querySelector('#imported'), r = line.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = reach(x, y) * 1.05, mode = on('wave'), water = mode === 'water' || mode === 'refract', ms = water ? 2000 : 820, pow = water ? 1.35 : 1;
  wave = { x, y, water, delay: (el) => { const b = el.getBoundingClientRect(), d = Math.min(0.98, Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y) / R); return water ? (1 - Math.pow(1 - d, 1 / pow)) * ms : d * 620; } };
  if (water) { surface.drip(x, y, { R, ms: ms * 1.12, amp: 1.5, pow, train: 230 }); setTimeout(() => surface.drip(x, y, { R: R * 0.5, ms: ms * 0.8, amp: 0.8, pow, train: 120 }), 420 * k); if (mode === 'refract') bend(main, x, y, R, ms * 1.12, pow); }
  else { rim(x, y, R, 820); setTimeout(() => rim(x, y, R * 0.8, 760), 130 * k); }
  play(line, [{ transform: 'scale(0.86, 1.3)' }, { transform: 'none' }], water ? 900 : 520, { easing: JELLY });
  for (const el of panels()) {
    const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - x, dy = b.top + b.height / 2 - y, d = Math.hypot(dx, dy) || 1, px = water ? 8 : 5;
    play(el, [{ transform: 'none' }, { transform: `translate(${((dx / d) * px).toFixed(1)}px, ${((dy / d) * px).toFixed(1)}px) scale(1.007, 0.996)`, offset: 0.25, easing: JELLY }, { transform: 'none' }], water ? 1200 : 620, { delay: Math.max(0, wave.delay(el) - (water ? 120 : 0)) });
  }
}
/** The page under the wave bends: a ring of displacement that grows with the front. */
function bend(el, x, y, R, ms, pow, id = 'bend') {
  const r = el.getBoundingClientRect(), f = document.querySelector(`#${id}`), imgs = f.querySelectorAll('feImage'), map = f.querySelector('feDisplacementMap'), t0 = performance.now();
  for (const [a, v] of Object.entries({ x: -r.left, y: -r.top, width: innerWidth, height: innerHeight })) f.setAttribute(a, v);
  el.style.filter = `url(#${id})`;
  // Scrolling ends it at once: its region is the window's as it was.
  let on = true; addEventListener('scroll', () => { on = false; }, { once: true });
  const tick = (t) => {
    const p = on ? Math.min(1, Math.max(0, t - t0) / (ms * k)) : 1, front = R * (1 - Math.pow(1 - p, pow)) / 0.8;
for (const img of imgs) { img.setAttribute('x', x - r.left - front); img.setAttribute('y', y - r.top - front); img.setAttribute('width', 2 * front + 1); img.setAttribute('height', 2 * front + 1); }
    map.setAttribute('scale', (46 * Math.min(1, p * 8) * (1 - p) ** 0.6).toFixed(2));
    if (p < 1) requestAnimationFrame(tick); else el.style.filter = '';
  };
  requestAnimationFrame(tick);
}
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="bend" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-color="#808080" result="flat"/><feImage preserveAspectRatio="none" result="ring"/><feMerge result="m"><feMergeNode in="flat"/><feMergeNode in="ring"/></feMerge><feDisplacementMap in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="wash" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-color="#808080" result="flat"/><feImage class="ring" preserveAspectRatio="none" result="ring"/><feImage class="disc" preserveAspectRatio="none" result="disc"/><feMerge result="m"><feMergeNode in="flat"/><feMergeNode in="ring"/></feMerge><feDisplacementMap in="SourceGraphic" in2="m" scale="0" xChannelSelector="R" yChannelSelector="G" result="d"/><feComposite in="d" in2="disc" operator="out"/></filter>
  <filter id="goo" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="16" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g"/><feGaussianBlur in="g" stdDeviation="7" result="h"/><feSpecularLighting in="h" surfaceScale="7" specularConstant="1.15" specularExponent="26" lighting-color="#e8f6ff" result="s"><feDistantLight azimuth="235" elevation="52"/></feSpecularLighting><feComposite in="s" in2="g" operator="in" result="l"/><feComposite in="g" in2="l" operator="arithmetic" k1="0" k2="0.62" k3="0.9" k4="0"/></filter></svg>`);
{ // The displacement ring, drawn once: a wave packet at 0.8 of the radius, pushing along it.
  const n = 400, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), d = g.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1, q = Math.hypot(u, v) || 1e-6, e = (q - 0.8) / 0.07, w = q < 1 ? Math.exp(-e * e) * Math.sin(e * 2.4) : 0, o = 4 * (j * n + i);
    d.data[o] = 128 + 127 * w * (u / q); d.data[o + 1] = 128 + 127 * w * (v / q); d.data[o + 2] = 128; d.data[o + 3] = 255;
  }
  g.putImageData(d, 0, 0); for (const i of document.querySelectorAll('#bend feImage, #wash .ring')) i.setAttribute('href', c.toDataURL());
  // What the wave has passed is gone.
  const a = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); a.addColorStop(0, '#000'); a.addColorStop(0.76, '#000'); a.addColorStop(0.82, 'transparent'); g.clearRect(0, 0, n, n); g.fillStyle = a; g.fillRect(0, 0, n, n); document.querySelector('#wash .disc').setAttribute('href', c.toDataURL());
}
/** A changed value: the old one melts off, the new one condenses inside a drop of glass that then evaporates. */
function condense(el, old, now) {
  const inner = document.createElement('span'); inner.className = 'm-drop';
  inner.innerHTML = `<i aria-hidden="true"></i><span class="old" aria-hidden="true">${old}</span><span class="new">${now}</span>`;
  el.replaceChildren(inner);
  const [bubble, was, is] = inner.children, delay = wave ? wave.delay(el) : 0, w = wave?.water ? 1.7 : 1;
  if (wave?.water) { const b = el.getBoundingClientRect(); setTimeout(() => surface.drip(b.left + b.width / 2, b.top + b.height / 2, { R: 110, ms: 1300, amp: 0.75, pow: 1.6, train: 60 }), (delay + 60) * k); }
  play(was, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(0.7em) scale(0.8, 1.5)' }], 220 * w, { delay, fill: 'both', easing: 'ease-in' });
  play(is, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: 'none' }], 620 * w, { delay: delay + 110 * w, fill: 'both', easing: JELLY });
  play(bubble, [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1.12, 0.94)', offset: 0.12 }, { opacity: 1, transform: 'scale(0.97, 1.04)', offset: 0.22 }, { opacity: 1, transform: 'none', offset: 0.32 }, { opacity: 1, transform: 'none', offset: 0.72 }, { opacity: 0, transform: 'scale(1.25)' }], 1500 * w, { delay: delay + 40, fill: 'both', easing: 'ease-out' });
  setTimeout(() => { if (el.contains(inner)) el.textContent = now; }, (delay + 1650 * w) * k);
}
/** A pill or ring flows from one place to the next: it stretches over the gap, then gathers. */
function gather(el, from, to, size, ms = 420) {
  const gap = Math.abs(to.y - from.y) + Math.abs(to.x - from.x), sy = 1 + Math.min(Math.abs(to.y - from.y), 160) / size.h * 0.55, sx = 1 + Math.min(Math.abs(to.x - from.x), 200) / size.w * 0.5;
  if (!gap) return;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2, T = (x, y, a = 1, b = 1) => `translate(${x}px, ${y}px) scale(${a}, ${b})`;
  play(el, [{ transform: T(from.x, from.y) }, { transform: T(mx, my, sx > 1.02 ? sx : 0.9, sy > 1.02 ? sy : 0.9), offset: 0.3, easing: SOFT }, { transform: T(to.x, to.y) }], ms, { easing: 'ease-in' });
}

/** Once the page is idle, the effect runs unseen, so its first use doesn't stall. */
(window.requestIdleCallback ?? ((f) => setTimeout(f, 800)))(() => { if (on('switch') !== 'wash') return; const l = copyPage(); l.style.opacity = '0.01'; bend(l.firstElementChild, 60, 60, 900, 300, 1.8, 'wash'); surface.drip(-400, -400, { R: 10, ms: 300, amp: 0.01, pow: 1, train: 40 }); setTimeout(() => l.remove(), 400); });
