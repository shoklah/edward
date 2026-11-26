// The mockup: edward's own rendered pages (captured from the fixtures build) with each candidate motion switchable.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement, main = $('#main');
const tpl = (id) => document.getElementById('t-' + id).content.cloneNode(true);

const MOMENTS = {
  switch: ['Page switch', { off: 'Off', settle: 'Settle: fade and rise', cross: 'Crossfade', dir: 'Slide, by rail order', drain: 'Drain', mercury: 'Mercury', wash: 'Wash', drip: 'Drip' }],
  wave: ['Import wave', { off: 'Off', ring: 'Ring', water: 'Water', refract: 'Water, the page bends' }],
  rail: ['Rail pill', { off: 'Off', glide: 'Glides', flow: 'Flows like a drop' }],
  title: ['Open a run', { off: 'As page switch', morph: 'Title travels' }],
  values: ['Values change', { off: 'Off', glow: 'Glow', swap: 'Swap', both: 'Swap and glow', ripple: 'Wave, values condense' }],
  eye: ["edward's eye", { off: 'Off', blink: 'Blinks on an import' }],
  row: ['Row opens', { off: 'Off', fade: 'Content fades in', slide: 'Rows below slide too', liquid: 'Inflates, rows flow' }],
  sort: ['Sort', { off: 'Off', move: 'Rows move', liquid: 'Rows flow' }],
  graph: ['Run graph opens', { off: 'Off', stages: 'Stage by stage', draw: 'Draws itself' }],
  ring: ['Graph selection', { off: 'Off', detail: 'Detail fades in', glide: 'Ring glides too', flow: 'Ring flows, detail inflates' }],
  feedIn: ['Feed item arrives', { off: 'Off', drop: 'Drops in, others move', drip: 'A drop lands' }],
  feedOut: ['Mark all seen', { off: 'Off', fade: 'Fades out', sweep: 'Swept off', melt: 'Melts away' }],
  showing: ['Showing mode', { off: 'Off', settle: 'Bar and page settle' }],
};
const PRESETS = {
  today: { label: 'Today', set: {} },
  quiet: { label: 'A Quiet', set: { switch: 'settle', values: 'swap', row: 'fade', ring: 'detail', feedIn: 'drop', feedOut: 'fade', showing: 'settle' } },
  moments: { label: 'B Moments', set: { switch: 'settle', rail: 'glide', values: 'glow', eye: 'blink', row: 'slide', sort: 'move', graph: 'stages', ring: 'glide', feedIn: 'drop', feedOut: 'sweep', showing: 'settle' } },
  playful: { label: 'C Playful', set: { switch: 'dir', rail: 'glide', title: 'morph', values: 'both', eye: 'blink', row: 'slide', sort: 'move', graph: 'draw', ring: 'glide', feedIn: 'drop', feedOut: 'sweep', showing: 'settle' } },
  drain: { label: 'Drain', set: { switch: 'drain', rail: 'flow', title: 'morph', values: 'ripple', wave: 'refract', eye: 'blink', row: 'liquid', sort: 'liquid', graph: 'draw', ring: 'flow', feedIn: 'drip', feedOut: 'melt', showing: 'settle' } },
  mercury: { label: 'Mercury', set: { switch: 'mercury', rail: 'flow', title: 'morph', values: 'ripple', wave: 'water', eye: 'blink', row: 'liquid', sort: 'liquid', graph: 'draw', ring: 'flow', feedIn: 'drip', feedOut: 'melt', showing: 'settle' } },
  wash: { label: 'Wash', set: { switch: 'wash', rail: 'flow', title: 'morph', values: 'ripple', wave: 'refract', eye: 'blink', row: 'liquid', sort: 'liquid', graph: 'draw', ring: 'flow', feedIn: 'drip', feedOut: 'melt', showing: 'off' } },
  drip: { label: 'Drip', set: { switch: 'drip', rail: 'flow', title: 'morph', values: 'ripple', wave: 'ring', eye: 'blink', row: 'liquid', sort: 'liquid', graph: 'draw', ring: 'flow', feedIn: 'drip', feedOut: 'melt', showing: 'settle' } },
};
let S = {}, preset = 'wash', k = 1, reduced = false;
const sysReduced = matchMedia('(prefers-reduced-motion: reduce)');
const on = (m) => (reduced || sysReduced.matches ? 'off' : S[m] ?? 'off');

function play(el, frames, ms, opts = {}) {
  return el.animate(frames, { duration: ms * k, easing: opts.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)', delay: (opts.delay ?? 0) * k, fill: opts.fill ?? 'backwards' });
}
function cls(el, c) { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); el.addEventListener('animationend', (e) => { if (e.target === el) el.classList.remove(c); }, { once: true }); }
/** FLIP: what `els` hold moves from where it was before `change` to where it is after. */
function flip(els, change, ms = 200, o = {}) {
  const was = els().map((el) => [el, el.getBoundingClientRect().top]);
  change(); let n = 0;
  for (const [el, y] of was) { if (!el.isConnected) continue; const d = y - el.getBoundingClientRect().top; if (Math.abs(d) > 0.5) play(el, [{ transform: `translateY(${d}px)` }, { transform: 'none' }], ms, { easing: o.easing ?? 'cubic-bezier(0.65, 0, 0.35, 1)', delay: (o.stagger ?? 0) * (o.last ? Math.max(0, Math.min(was.length, 8) - 1 - n++) : Math.min(n++, 8)) }); }
}

// --- Pages -----------------------------------------------------------------------------------------------------------
const ORDER = ['home', 'weeks', 'work', 'findings', 'context', 'spend', 'compliance', 'steps', 'skills', 'models'];
const PAGE = { '/': 'home', '/weeks': 'weeks', '/work': 'work', '/steps': 'steps' };
let page = 'home', current = 'home';
const railOf = (p) => (p === 'run' ? 'work' : p);
function draw(p) {
  main.replaceChildren(document.getElementById('t-' + p) ? tpl(p) : Object.assign(document.createElement('div'), { innerHTML: `<h1 class="text-page-title" tabindex="-1">${p[0].toUpperCase() + p.slice(1)}</h1><section class="glass mt-4 p-4 text-sm">This page isn't in the mockup. Home, Weeks, Work and Steps and rules are.</section>` }));
  if (p === 'home' && seen) emptyFeed();
  scrollTo(0, 0);
  if (p === 'run') wireGraph();
}
function setRail(p, from) {
  const nav = $('aside nav');
  for (const a of $$('a', nav)) { const is = a.dataset.page === railOf(p); a.classList.toggle('font-semibold', is); is ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); a.classList.remove('bg-accent'); }
  const a = $(`a[data-page="${railOf(p)}"]`, nav), pill = $('.m-pill', nav);
  const y = a.getBoundingClientRect().top - nav.getBoundingClientRect().top;
  const was = pill.offsetTop + (pill._y ?? y);
  pill.style.height = a.offsetHeight + 'px'; pill.style.transform = `translateY(${y}px)`;
  if (from && on('rail') === 'glide' && pill._y !== undefined && pill._y !== y) play(pill, [{ transform: `translateY(${pill._y}px)` }, { transform: `translateY(${y}px)` }], 200, { easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
  if (from && on('rail') === 'flow' && pill._y !== undefined && pill._y !== y) gather(pill, { x: 0, y: pill._y }, { x: 0, y }, { w: pill.offsetWidth, h: pill.offsetHeight });
  pill._y = y;
}
function go(p, link) {
  if (p === page && p !== 'run') return;
  const from = page, change = () => { page = p; draw(p); };
  const mode = on('switch'), morph = p === 'run' && link && on('title') === 'morph' && document.startViewTransition;
  setRail(p, from);
  if (RAIL_SWITCH.includes(mode)) {
    liquidSwitch(mode, p, () => { change(); if (p === 'run') graphIn(); }, from, link);
  } else if ((mode === 'cross' || mode === 'dir' || morph) && document.startViewTransition) {
    if (mode === 'dir') html.dataset.dir = ORDER.indexOf(railOf(p)) >= ORDER.indexOf(railOf(from)) ? 'down' : 'up';
    if (morph) link.style.viewTransitionName = 'run-title';
    const vt = document.startViewTransition(() => { change(); if (morph) $('h1', main).style.viewTransitionName = 'run-title'; if (p === 'run') graphIn(); });
    vt.finished.finally(() => { delete html.dataset.dir; const h = $('h1', main); if (h) h.style.viewTransitionName = ''; });
  } else {
    change();
    if (mode === 'settle') cls(main.firstElementChild, 'm-rise');
    if (p === 'run') graphIn();
  }
  $('h1', main)?.focus({ preventScroll: true });
}

// --- An import lands -------------------------------------------------------------------------------------------------
let imports = 0, seen = false;
const bumpable = () => $$('td span, td, dd span, dd', main).filter((el) => el.childElementCount === 0 && /^\d+(\.\d+)?$/.test(el.textContent.trim()) && el.textContent.trim() !== '0' && el.offsetParent && el.getBoundingClientRect().top < innerHeight && !el.closest('[data-scroll-cue=block]'));
function changeValue(el) {
  const old = el.textContent.trim(), dec = old.split('.')[1]?.length ?? 0, now = (Number(old) + (dec ? 0.3 : 1 + (imports % 3))).toFixed(dec), mode = on('values');
  el.textContent = now;
  if (mode === 'off') return;
  if (mode === 'ripple') return condense(el, old, now);
  const inner = document.createElement('span');
  el.replaceChildren(inner);
  if (mode === 'swap' || mode === 'both') { inner.className = 'm-swap'; inner.innerHTML = `<span class="old" aria-hidden="true">${old}</span><span class="new">${now}</span>`; }
  else inner.textContent = now;
  if (mode === 'glow' || mode === 'both') inner.classList.add('m-glow');
  setTimeout(() => { if (el.contains(inner)) el.textContent = now; }, 1300 * k);
}
function land() {
  imports++;
  if (on('values') === 'ripple') ripple(); else wave = null;
  const list = bumpable(), n = Math.min(9, list.length);
  for (let i = 0; i < n; i++) changeValue(list[Math.floor((i * list.length) / n + (imports % 2))] ?? list[i]);
  if (on('eye') === 'blink') cls($('aside svg'), 'm-blink');
  const t = $('#imported'); t.textContent = `Nov 12, 12:${String(imports % 60).padStart(2, '0')}`;
  if (page === 'home') feedItem();
  if (page === 'work') newRun();
}
function refresh() {
  const icon = $('#refresh svg'); icon.style.animation = 'spin 1s linear infinite';
  setTimeout(() => { icon.style.animation = ''; land(); }, 900);
}
function newRun() {
  const body = $('tbody', main), first = $('tr', body);
  if (!first) return;
  closeRows();
  const row = first.cloneNode(true); const a = $('a', row); a.textContent = ['Keep drafts across tabs', 'Trim the sync log daily', 'Name exports by notebook'][imports % 3];
  $('time', row) && ($('time', row).textContent = $('#imported').textContent);
  delete row.dataset.key; row.dataset.key = '0';
  const add = () => body.prepend(row);
  if (on('feedIn') === 'drip') { flip(() => $$('tr', body), add, 520, { easing: SOFT, stagger: 16, last: true }); play(row, [{ opacity: 0, transform: 'translateY(-26px) scale(0.96, 1.3)' }, { opacity: 1, offset: 0.2 }, {}], 620, { delay: 80, easing: SOFT }); }
  else if (on('feedIn') === 'drop') { flip(() => $$('tr', body), add); play(row, [{ opacity: 0, transform: 'translateY(-8px)' }, {}], 180, { delay: 90 }); } else add();
}

// --- The feed --------------------------------------------------------------------------------------------------------
const feedList = () => $('[data-scroll-cue=block] ul', main);
function feedItem() {
  if (seen) { seen = false; const s = $('[data-feed-empty]', main); if (s) s.outerHTML = `<div data-scroll-cue="block" class="max-h-96 overflow-y-auto lg:max-h-none"><ul class="flex flex-col gap-3"></ul></div>`; }
  const ul = feedList(); if (!ul) return;
  const item = document.getElementById('t-home').content.querySelector('[data-scroll-cue=block] li').cloneNode(true);
  $('a', item).textContent = ['Keep drafts across tabs', 'Trim the sync log daily', 'Name exports by notebook'][imports % 3]; $('time', item).textContent = $('#imported').textContent;
  if (on('feedIn') === 'drip') { const delay = wave ? wave.delay(ul) : 0; setTimeout(() => { flip(() => $$('li', ul), () => ul.prepend(item), 560, { easing: SOFT, stagger: 16, last: true }); play(item, [{ opacity: 0, transform: 'translateY(-34px) scale(0.5, 1.2)' }, { opacity: 1, offset: 0.18 }, {}], 680, { delay: 150, easing: SOFT }); item.style.transformOrigin = '0 0'; if (wave?.water) { const b = ul.getBoundingClientRect(); surface.drip(b.left + b.width / 2, b.top + 30, { R: 190, ms: 1400, amp: 0.9, pow: 1.6, train: 80 }); } }, delay * k); }
  else if (on('feedIn') === 'drop') { flip(() => $$('li', ul), () => ul.prepend(item)); play(item, [{ opacity: 0, transform: 'translateY(-8px)' }, {}], 180, { delay: 90 }); } else ul.prepend(item);
}
function emptyFeed() {
  const box = $('[data-scroll-cue=block]', main); if (!box) return;
  box.outerHTML = '<p data-feed-empty class="text-muted-foreground">Nothing new. Finished runs and new warnings show here until you mark them seen.</p>';
}
async function markSeen() {
  const ul = feedList(); if (!ul) return;
  const mode = on('feedOut');
  if (mode !== 'off') {
    const box = ul.parentElement, view = box.getBoundingClientRect();
    const items = $$('li', ul).filter((li) => li.getBoundingClientRect().top < view.bottom);
    box.style.overflow = 'hidden';
    await Promise.all(items.map((li, i) => mode === 'melt'
      ? play(li, [{ opacity: 1 }, { opacity: 0.9, transform: 'translateY(6px) scale(0.99, 1.08)', offset: 0.4 }, { opacity: 0, transform: 'translateY(46px) scale(0.86, 1.35)' }], 260, { delay: (items.length - 1 - i) * 34, fill: 'both', easing: 'ease-in' }).finished
      : mode === 'sweep'
      ? play(li, [{}, { opacity: 0, transform: 'translateX(40px)' }], 130, { delay: i * 30, fill: 'both', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }).finished
      : play(li, [{}, { opacity: 0 }], 100, { fill: 'both' }).finished));
  }
  seen = true; emptyFeed();
  if (mode !== 'off') cls($('[data-feed-empty]', main), 'm-appear');
}

// --- Lists -----------------------------------------------------------------------------------------------------------
const OPENED = JSON.parse($('#opened').textContent);
function setChevron(button, open) {
  const svg = $('svg', button); button.setAttribute('aria-expanded', open); svg.classList.toggle('chev-open', open);
  if (on('row') !== 'off') play(svg, open ? [{ transform: 'rotate(0)' }, { transform: 'rotate(90deg)' }] : [{ transform: 'rotate(90deg)' }, { transform: 'rotate(0)' }], open ? 160 : 100);
}
function closeRows() { for (const b of $$('tbody button[aria-expanded=true]', main)) toggleRow(b); }
function toggleRow(button) {
  const row = button.closest('tr'), open = button.getAttribute('aria-expanded') !== 'true', mode = on('row');
  if (!open) { row.nextElementSibling?.matches('[data-opened]') && row.nextElementSibling.remove(); row.classList.remove('border-b-0'); setChevron(button, false); return; }
  const t = document.createElement('template'); t.innerHTML = OPENED[row.dataset.key ?? 0]; const detail = t.content.firstElementChild; detail.dataset.opened = '';
  const add = () => { row.after(detail); row.classList.add('border-b-0'); };
  if (mode === 'liquid') flip(() => [...$$('tr', row.parentElement).slice([...row.parentElement.children].indexOf(row) + 1)], add, 460, { easing: FIRM, stagger: 12, last: true });
  else if (mode === 'slide') flip(() => [...$$('tr', row.parentElement).slice([...row.parentElement.children].indexOf(row) + 1)], add, 180); else add();
  setChevron(button, true);
  if (mode === 'liquid') play($('td > div', detail), [{ opacity: 0, transform: 'scale(0.96, 0.6)' }, { opacity: 1, offset: 0.35 }, {}], 480, { easing: SOFT }), ($('td > div', detail).style.transformOrigin = 'top left');
  else if (mode !== 'off') play($('td > div', detail), [{ opacity: 0, transform: 'translateY(-4px)' }, {}], 160, { delay: mode === 'slide' ? 70 : 0 });
}
function sortBy(head) {
  const th = head.closest('th'), i = [...th.parentElement.children].indexOf(th), body = $('tbody', th.closest('table'));
  closeRows();
  const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : th.getAttribute('aria-sort') === 'descending' ? null : 'ascending';
  for (const o of $$('th', th.parentElement)) o.removeAttribute('aria-sort'); if (dir) th.setAttribute('aria-sort', dir);
  const rows = $$('tr', body), val = (r) => { const c = r.children[i], t = $('time', c)?.dateTime ?? c.textContent.trim(), n = Number(t); return Number.isNaN(n) ? t : n; };
  const sorted = [...rows].sort((a, b) => { if (!dir) return a.dataset.key - b.dataset.key; const x = val(a), y = val(b), c = x < y ? -1 : x > y ? 1 : 0; return dir === 'ascending' ? c : -c; });
  const change = () => body.append(...sorted);
  on('sort') === 'liquid' ? flip(() => rows, change, 520, { easing: FIRM, stagger: 18 }) : on('sort') === 'move' ? flip(() => rows, change, 220) : change();
}

// --- The run graph ---------------------------------------------------------------------------------------------------
const DETAILS = JSON.parse($('#details').textContent);
const flowOf = () => $('[aria-label="The run\'s flow"]', main);
let IDLE = '';
function wireGraph() {
  const flow = flowOf(); IDLE = flow.nextElementSibling.innerHTML; ring = null;
  flow.toggleAttribute('data-glide', true);
  $$('button', flow).forEach((b, i) => (b.dataset.i = i));
}
let ring = null;
function select(button) {
  const flow = flowOf(), box = $('div', flow), detail = flow.nextElementSibling, mode = on('ring');
  const was = $('button[aria-pressed=true]', flow), isOn = was === button;
  for (const b of $$('button', flow)) b.setAttribute('aria-pressed', 'false');
  if (isOn || !button) { ring?.remove(); ring = null; detail.innerHTML = IDLE; return; }
  button.setAttribute('aria-pressed', 'true');
  const at = (b) => `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  if (!ring) { ring = document.createElement('div'); ring.className = 'm-ring'; box.append(ring); if (mode === 'glide') play(ring, [{ opacity: 0 }, {}], 120); }
  else if (mode === 'glide' && was) play(ring, [{ transform: at(was) }, { transform: at(button) }], 220, { easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
  else if (mode === 'flow' && was) gather(ring, { x: was.offsetLeft, y: was.offsetTop }, { x: button.offsetLeft, y: button.offsetTop }, { w: button.offsetWidth, h: button.offsetHeight });
  Object.assign(ring.style, { width: button.offsetWidth + 'px', height: button.offsetHeight + 'px', transform: at(button) });
  detail.innerHTML = DETAILS[button.dataset.i];
  if (mode === 'flow') { detail.firstElementChild.style.transformOrigin = 'top left'; play(detail.firstElementChild, [{ opacity: 0, transform: 'scale(0.97, 0.8)' }, { opacity: 1, offset: 0.3 }, {}], 460, { easing: FIRM }); }
  else if (mode !== 'off') cls(detail.firstElementChild, 'm-settle');
}
function graphIn() {
  const mode = on('graph'); if (mode === 'off') return;
  const flow = flowOf(), box = $('div', flow), W = box.offsetWidth;
  const svg = $('svg', flow), items = $$(':scope > button, :scope > span, :scope > div', box);
  // Reading order along the flow: by row, then across.
  const mid = box.offsetHeight * 0.66, pos = (x, y) => (y > mid ? W : 0) + x;
  const all = [...items.map((el) => [el, pos(el.offsetLeft, el.offsetTop)]), ...$$(':scope > path', svg).map((p) => { const b = p.getBBox(); return [p, pos(b.x, b.y + b.height / 2)]; })];
  const span = mode === 'draw' ? 900 : 320, max = Math.max(...all.map(([, x]) => x)), min = Math.min(...all.map(([, x]) => x));
  for (const [el, x] of all) {
    const delay = ((x - min) / (max - min)) * span;
    if (el.tagName === 'path') {
      if (mode === 'draw' && !el.getAttribute('stroke-dasharray') && !/url/.test(el.getAttribute('stroke'))) { const L = el.getTotalLength(); el.style.strokeDasharray = L; const head = el.getAttribute('marker-end'); el.removeAttribute('marker-end'); play(el, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], 260, { delay: delay + 60, fill: 'both' }).finished.then(() => { el.style.strokeDasharray = ''; if (head) el.setAttribute('marker-end', head); }); }
      else play(el, [{ opacity: 0 }, {}], 160, { delay });
    } else play(el, [{ opacity: 0, transform: 'scale(0.95)' }, {}], 180, { delay });
  }
}

// --- Showing mode ----------------------------------------------------------------------------------------------------
const foot = $('#showing'), FOOT = foot.innerHTML;
function showing(start) {
  const mode = on('showing');
  foot.innerHTML = start ? '<div class="flex px-3 flex-col gap-2 py-2 rounded-panel border border-notice-edge bg-notice text-notice-ink text-sm"><b>Showing: Lantern Notes</b><button data-variant="outline" data-size="sm" class="border px-3 h-8" id="stop">Stop showing</button></div>' : FOOT;
  if (mode === 'settle') { cls(foot.firstElementChild, 'm-rise'); cls(main.firstElementChild, 'm-rise'); }
}

// --- Wiring ----------------------------------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  if (e.target.closest('#ctl')) return;
  const a = e.target.closest('a[href]'), b = e.target.closest('button');
  if (a) {
    e.preventDefault(); const href = a.getAttribute('href');
    if (href.startsWith('/runs/')) return go('run', a.closest('main') ? a : null);
    const key = a.dataset.page ?? PAGE[href.split('?')[0]] ?? href.slice(1).split(/[/?]/)[0];
    return go(ORDER.includes(key) ? key : 'home');
  }
  if (!b) return;
  if (b.id === 'refresh') return refresh();
  if (b.id === 'stop') return showing(false);
  if (b.getAttribute('role') === 'switch') return showing(true);
  if (b.getAttribute('aria-label') === 'Mark all seen') return void markSeen();
  if (b.closest('[data-list]') && b.closest('th')) return sortBy(b);
  if (b.hasAttribute('aria-expanded') && b.closest('[data-list]')) return toggleRow(b);
  if (flowOf()?.contains(b)) return select(b);
  if (/^Close /.test(b.getAttribute('aria-label') ?? '')) return select(null);
});

// --- Control strip ---------------------------------------------------------------------------------------------------
const ctl = $('#ctl');
let more = false;
function renderCtl() {
  html.dataset.preset = preset;
  ctl.innerHTML = `<h3>Motion mockup <button data-do="shut">${ctl.classList.contains('shut') ? 'Open' : 'Hide'}</button></h3><div class="body">
  <div class="btns">${Object.entries(PRESETS).map(([id, p]) => `<button data-preset="${id}" aria-pressed="${preset === id}">${p.label}</button>`).join('')}</div>
  <div class="btns"><button class="act" data-do="land">Land an import</button><button class="act" data-do="run">Open a run</button><button class="act" data-do="replay">Replay</button></div>
  <div class="btns"><button data-do="slow" aria-pressed="${k !== 1}">${k === 1 ? 'Full speed' : 'Slow ×' + k}</button><button data-do="reduced" aria-pressed="${reduced}">Reduced motion</button><button data-do="theme">${html.classList.contains('dark') ? 'Light' : 'Dark'}</button></div>
  <button data-do="more" aria-expanded="${more}">${more ? 'Hide each moment' : 'Choose each moment'}</button>${!more ? '' : Object.entries(MOMENTS).map(([id, [name, o]]) => `<label class="row"><span>${name}</span><select data-m="${id}">${Object.entries(o).map(([v, t]) => `<option value="${v}" ${(S[id] ?? 'off') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('')}
  <p>Invented data. Rail, rows, headers, graph boxes, Refresh, Showing mode and the feed's broom work.</p></div>`;
}
ctl.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.preset) { preset = b.dataset.preset; S = { ...PRESETS[preset].set }; renderCtl(); return; }
  ({ land, run: () => { if (page === 'run') page = 'x'; go('run'); }, replay: () => { const p = page; if (p === 'run') { page = 'work'; draw('work'); page = 'work'; setTimeout(() => go('run', $('a[href^="/runs/"]', main)), 350); } else { page = 'x'; go(p); } },
    slow: () => { k = k === 1 ? 2 : k === 2 ? 5 : 1; html.style.setProperty('--k', k); renderCtl(); }, reduced: () => { reduced = !reduced; renderCtl(); },
    theme: () => { html.classList.toggle('dark'); renderCtl(); }, shut: () => { ctl.classList.toggle('shut'); renderCtl(); }, more: () => { more = !more; renderCtl(); } })[b.dataset.do]?.();
});
ctl.addEventListener('change', (e) => { S[e.target.dataset.m] = e.target.value; preset = 'custom'; renderCtl(); html.dataset.preset = 'custom'; });

const nav = $('aside nav'); nav.classList.add('piloted'); nav.prepend(Object.assign(document.createElement('span'), { className: 'm-pill', ariaHidden: 'true' }));
S = { ...PRESETS.wash.set }; renderCtl(); draw('home'); setRail('home');
document.fonts.ready.then(() => setRail(page));
