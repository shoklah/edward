# Motion: Edward is liquid glass

Status: draft, waiting for the owner's approval. Goal: dashboard-ui. Path: Full (every page changes, and `DESIGN.md`'s Motion section is replaced). Kit: ui [react-tailwind-shadcn] v0.2.0, tag motion. Mockup: `docs/design/2026-11-25-motion/` (live, on the app's own captured pages with invented data; open its `index.html` through any static server). Its preset **Wash** is what the owner picked; the other presets are what it was picked from.

## Intent

Edward is a playground and a portfolio piece. Its look is glass, but nothing on screen behaves like it: pages swap, numbers replace themselves, rows jump. The owner wants motion that is bold and unmistakably this app's, without giving up performance, and wants its feel **enforced** the way the standup tracker enforces its arcade feel: one named sentence that everything on screen is held to.

> **Edward is liquid glass.** What leaves is washed away, what arrives condenses from where it was called, what changes forms inside a drop, and what moves flows. A plain fade or slide is a defect.

## Goals

- Changing page, opening a run and landing an import each read as one event on one liquid surface.
- Every moving thing uses one of four verbs (wash, condense, ripple, flow) and the same springs.
- Motion explains: it starts where the reader acted, or where the news came in, and shows what changed.
- The new page answers clicks and keys from its first frame. No motion delays a request, the DOM or the focus; the one thing drawn late is a number an import changed, which keeps its old look until the wave reaches it (2 s at most).
- Under `prefers-reduced-motion` everything changes at once and nothing moves.

## Non-goals

- The graphs on Work's pages (`SessionGraph`) and Home's workflow diagram drawing themselves.
- Sound, pointer-following effects, parallax, a continuously moving surface.
- A setting to turn motion off beside the system's.
- New screens, layouts or texts.
- Editing the kit: its rule is a change request, at the end.

## Anti-goals

- A number that counts up: the values in between are false.
- A wave with nothing to say, or one that plays while idle.
- A copy of a page that outlives its wash, or that shows what showing mode hides.
- A page the reader waits for.

## Constraints

- No dependency is added. CSS, the Web Animations API, SVG filters and one WebGL2 canvas cover it; a motion library (Motion, GSAP) and React's or the browser's view transitions were considered and dropped (Approaches).
- Motion animates `transform` and `opacity`, plus `stroke-dashoffset` for the run graph's lines, and two SVG filters on one element while a wave runs. Charts, hover, the backdrop, filters, paging, the focus and closing a row never move.
- Nothing carries a `backdrop-filter`. The page is drawn through a filter only while a wave runs (at most 2.3 s), and the live page never while it scrolls.
- Text under a wave still reads: the light adds to the page, it never covers it.

## What was measured

Chrome 158 headed, 1728×903 at 2×, a 120 Hz display, Apple M4 Pro on AC, 2026-11-25. Today's app was measured on the fixtures build (`5c18156`); everything else on the mockup, which is the fixtures' pages. "Missed" is frames missed at 120 Hz.

| What | Full speed | CPU slowed 4× |
|---|---|---|
| Scrolling Home, Steps, Weeks today | 111–128 fps, 0–1 dropped | not measured |
| Page switch today | 0–1 missed | median 0–0.5, worst 4 |
| Wash, traced (16) | median 0.5–1; 3 of 8 in dark had gaps to 174 ms | median 4–5.5, worst 12, longest gap 51 ms (untraced) |
| Wash, untraced (144), unprepared half | 1 of 72 over 20 ms (26 ms) | |
| Wash, untraced, prepared half | 0 of 72 over 20 ms | |
| Import wave with the page bending | 0–1 missed | at most 3 |
| Six rows opened today | 18–19 dropped, from `table.tsx`'s row `transition-colors` | not measured |
| Six rows opened, liquid, that transition gone | 0 | not measured |

- The large gaps came only with Chrome's tracing on, as they did for two other variants; the cause isn't proven. The first switch of an unprepared page showed 40–60 ms gaps while it was being recorded.
- An animated CSS `mask` on the old page cost 31–41 missed frames at 4×; the same cut inside the SVG filter costs 4–5.5.
- `url()` filters are ignored on view-transition snapshots.
- Opening a run as designed here (wave from the link) was filmed, not measured. The plan measures it.

## Approaches

| Approach | Trade-off | |
|---|---|---|
| CSS keyframes, WAAPI, SVG filters and a small WebGL2 surface | The only one that gives refraction and light; about 400 lines of our own, Chromium for the refraction | **Picked** |
| View transitions (the browser's or React's `ViewTransition`) | Least code for a crossfade or a travelling title, but a snapshot takes no `url()` filter and its overlay swallows clicks | Dropped |
| A motion library (Motion, GSAP) | Springs and layout animation ready-made, but no refraction, and a library for about 60 lines of springs and FLIP | Dropped |

For the old page leaving, the owner was shown Drip (the page melts), Drain (panels shrink into the rail), Mercury (panels run together) and Wash, as recordings and live, and picked **Wash** (2026-11-25).

## Owner decisions

- Bold is welcome: it is a playground and a portfolio project. Performance isn't to be sacrificed.
- Playful's "Open a run" and "Replay" (the title travels, the graph draws itself) stay.
- The page switch through the rail is liquid glass; **Wash**.
- The import wave is slower and textured: water light, and the page bends under it.
- The liquid glass feel is enforced by a rule, and may be one in the kit too.

## The moments

| Moment | What moves | How long |
|---|---|---|
| **A new page** (the path changes inside the shell) | The wave starts where the reader pressed. The old page, as an inert copy, bends under the front and is cut away behind it. Each new panel, and each block outside a panel, condenses once the front has passed it: from 34 px nearer the source, scale 0.9, opacity 0 | Front 900 ms; a block's condensing 640 ms, opaque after 190, so the far corner reads at about 1 s and rests at 1.4 s |
| **Opening a run** by a link in the page | As above from the link, and the run's `h1` travels from the link's place and size, if it is drawn before the front is done. Then, once its panel is opaque, the graph draws itself | Title 620 ms; graph about 1.2 s |
| **The rail** | The current entry's pill stretches over the gap and gathers on the new entry | 420 ms |
| **An import lands** and a number, feed item or list row in the window changed | A drop hits "Imported". The wave runs through the page, the page bends under it, and each panel bobs 8 px as it passes | Front 2 s, over by 2.3 s |
| ↳ a changed number | When the front reaches it: the old number melts off, the new one forms inside a drop of glass that then evaporates, and sends its own ripple. At most 9 in the window, spread over it; the others change at once | 2.6 s each, the last over 4.6 s after the drop |
| ↳ a new feed item or list row | Lands as a drop with its own ripple; the rest flow down, the last first | 680 ms |
| **An import lands** and none did | A small ripple (110 px) on the "Imported" line; nothing else | 1.3 s |
| edward's eye, on any import | Blinks | 260 ms |
| **A row opens** | Its content condenses, top left; the rows below flow down, the last first; the chevron turns | 480 ms |
| **A column is sorted** | Rows on the page flow to their places; rows new to it condense | 520 ms, 18 ms apart |
| **A graph box is selected** | The ring stretches from the last box and gathers; the detail condenses | 420 ms |
| **Mark all seen** | Once the server has answered and the list is redrawn, inert copies of the items that left run down and off, the last first | 260 ms each, 34 ms apart |
| **A switch's thumb** | Flows, on the firm spring | 160 ms |
| **A dialog or a tooltip** | Condenses, as today, from scale 0.95 and opacity 0; a dialog goes back the same way in 120 ms | 200 ms |

Closing a row, paging, filtering, switching a view or a measure, hover, focus, selecting nothing, a chart's data and a loading or error state all change at once, and so does everything under reduced motion.

Springs, through `linear()` easings made by one function: firm (damping 0.75) for pages, sorting and rows; soft (0.55) for arrivals; jelly (0.38) for numbers and bobs. Travelling between two places (pill, ring) is a stretch over 30% of the time, then the soft spring.

### Why each place moves, and why the rest doesn't

- A page, a run, an opened row, a sort, a selection: the reader asked for it, and the motion says where it came from.
- An import: the one change nobody asked for; today the page silently changes. The wave says so once, and the drops say what changed.
- Showing mode, its Stop, switching the viewed account and signing out change at once, with no copy of the old page: their point is what is hidden.
- The first load, `/signin` and the not-found and error pages: nothing was called from anywhere. Going to and from a not-found page inside the shell washes as any page.
- A link to the same path (a query change: Work's views, Compliance's step): the page is the same one.

## How it works

All in `packages/web/src/motion/`, with no other file calling `Element.animate`.

**Motion allowed.** One function says whether motion runs: not under `prefers-reduced-motion: reduce` (read when asked, so a change counts at once) and not while `document.hidden`. Every entry point asks it first and otherwise does nothing: the DOM is already in its final state, since motion only ever plays *from* somewhere. The CSS rule in `index.css` stays for CSS animations.

**The water.** One canvas, WebGL2, at one device pixel per CSS pixel, fixed over the window, `pointer-events: none`, `aria-hidden`. It exists in the page only while a drop runs. A drop has a place, a reach, a time, a strength and a train length; the shader sums up to 14 and draws light only: speculars, caustics tinted by the backdrop's pink and cyan in dark, and blue and violet shade in light. With no WebGL2, or when its context is lost, there is no light and the rest is unchanged. The mockup's `surface.js` is the reference for the shader.

**The bend and the cut.** Two SVG filters rendered once in `Shell`: `bend` (a ring of displacement that grows with the front) and `wash` (the same, then everything inside the front removed). Their two maps are drawn once on a canvas. They are Chromium only: elsewhere (no `navigator.userAgentData`) there is no copy and no bend, and the light, condensing and everything else stay. The import's bend, which is on the live page, ends at the first scroll of the window, and the wave's light goes on; the wash's copy doesn't move, so its filter doesn't end.

**The page switch.**
- The source is the last `a[href]` activated (pointer or keyboard) less than a second before the router starts loading, as its rectangle at that moment. Otherwise (Back, Forward, a script), or when that link is in the Menu dialog, it is the rail's current entry, or the Menu button under 768 px, or the top left when neither shows.
- When the router starts a load whose path changes, the old `main` is cloned, detached: `aria-hidden`, `inert`, no `id`, its scrolled regions' positions kept. If the load ends without a new page, the clone is dropped.
- The clone is attached behind `main`, in a window-sized layer, in the same frame the new page commits, so the two are never drawn over each other before the wave starts. It is removed when the front is done, when another switch starts, and on showing mode, account switching and sign out.
- The wave starts in `onRendered`, after the router's own scroll to the top, so places are measured where the new page stands. The copy's layer is fixed and the copy is a picture in window coordinates, so no scroll, the app's or the reader's, ends or moves the wash; a scroll moves only the new page in front of it. A block that Back's restored scroll brings into the window later is already there.
- A page whose path changes while its component stays (run to run, change to change, goal to goal) is keyed by its key in `router.tsx`, as Compliance is by its step, so `keepPreviousData` never draws the old run under the new one's key and the wave never reveals it.
- The panels a new page adds during the wave (its data arriving after its loading state) condense at their place in the wave; those the front has already passed condense at once. The wave waits for nothing.
- The focus, the scroll restoration and the tab title stay exactly as today.

**Preparing.** Once, when the browser is idle after the first page is drawn, the filters and the shader run unseen for 300 ms, so the first switch doesn't stall.

**What changed in an import.**
- An import is a later `lastGoodImportAt` with the same account viewed; the first status, and a switch of account, aren't one.
- `Num` and a `HeatmapTable` cell are the places that notice a changed number: its text differs from the one it drew before. They tell `motion/` so, in the same commit.
- `useLiveQuery` knows an import's data has landed: the same path, a new `lastGoodImportAt`, and no longer placeholder data. The first landing of an import with something noticed in the window starts the wave; later ones of the same import join it. Once no query is fetching and nothing in the window was noticed, the small ripple plays instead. So a landing that shows no number (`/api/showing`, a filter's options) decides nothing.
- Numbers noticed in a commit with no such landing (a filter, a sort, a page) are forgotten in the same frame.
- `Feed` and `DataList` land their new keys in the same way. A list's rows flow only for a sort or an import, never for a page or a filter.
- What is outside the window, and charts and texts, change at once and start no wave.
- The DOM holds the new number from the commit; the old one is an `aria-hidden` picture over it until the front arrives.
- The source is the "Imported" line, or the Refresh button where the rail is hidden, or the top left.
- Imports come when the run log changes or, at most every 15 minutes, when a transcript did, so a wave per import is not a nuisance.

**Moved rows.** One hook (FLIP): it remembers each row's place by key relative to its table, so scrolling doesn't count, and plays from the old place to the new.

**The run graph.** It draws itself each time a press, Back or Forward brings the reader to a run, never on a first load: it starts once its panel is opaque, or at once if its data comes after the wave. Boxes condense and lines are drawn in reading order, 900 ms from first to last. Nor does it on a resize, an import or a return to a box. The selection ring is one element that moves; `aria-pressed` and the focus ring stay on the boxes.

**Mark all seen.** The items are cloned, detached, with their places, when pressed. When the POST and the refetch are done, the clones of the items no longer in the list are attached over it, `aria-hidden` and inert, played and removed; the "Nothing new" line condenses. If the POST fails, or an item stays, its clone is dropped.

**Existing transitions.** Through unlayered rules in `index.css`, as the pill rule does, so no generated file is edited: none on a button, a table row or a switch's track (hover and presses are instant), only `transform` on a switch's thumb, the firm spring for that thumb, and 120 ms for a closing dialog.

## `DESIGN.md`

Overview gains one sentence: "It is liquid glass: the panels are drops on one surface, and what moves behaves so."

**Motion** becomes:

> Edward is liquid glass. What leaves is **washed** away, what arrives **condenses** from where it was called, what changes forms inside a drop and sends a **ripple**, and what moves **flows**. Every motion is one of the four; a plain fade or slide is a defect. A dialog and a tooltip condense; a switch's thumb flows.
>
> Motion explains a change and nothing else. The reader's own actions finish within 700 ms. A page is usable from its first frame, reads to its far corner within 1 s of the press and rests within 1.5 s. Two things take longer: an import (a 2 s wave; the last drop has evaporated 4.6 s after it lands) and the run graph drawing itself (1.2 s).
>
> Only `transform` and `opacity` animate, plus the graph's lines and, while a wave runs, the two water filters. Springs, never a bounce that hides a value. Numbers never count up. Charts, hover, focus, the backdrop, filters, paging, closing a row and showing mode change at once. Under `prefers-reduced-motion` everything does.

**Do's:** "Start a motion where the reader acted, or where the news came in." **Don'ts:** "Animate the backdrop" stays; add "Move anything outside the four verbs" and "Play a wave with nothing to say". Elevation's reason for no panel filter stays, and adds: the page goes through a filter only while a wave runs.

## `CLAUDE.md`

Design conventions' first line becomes: "The look is the root `DESIGN.md` (night glass, with liquid glass as its light pair, and liquid glass as how it moves: what leaves washes away, what arrives condenses, what changes ripples, what moves flows); screens are designed and reviewed against it."

Code conventions, replacing the reduced-motion line:

- Motion lives in `packages/web/src/motion/`, the one place that calls `Element.animate`, and each motion is one of `DESIGN.md`'s four verbs. It plays only *from* somewhere to the DOM's own state, so a test or a reduced-motion reader sees the final state at once.
- Motion is removed under `prefers-reduced-motion` in two places only: `motion/`'s one test of whether it runs, and the one rule in `index.css` for CSS animations.
- An inert copy (the old page, the items marked seen) is made and removed only in `motion/`, is `aria-hidden` and `inert`, and never exists over a showing mode, account or sign-out change.
- Which numbers an import changed is noticed only by `Num` and `HeatmapTable`'s cells, and that an import's data landed only by `useLiveQuery`.
- A page whose route has a key in its path is keyed by it in `router.tsx`, so it never draws another key's data.
- The e2e checks and screens run with reduced motion; `e2e/motion.spec.ts` alone turns it on.

Stack gains one line under Final's neighbours: "**Motion:** no library: CSS, the Web Animations API, SVG filters and one WebGL2 surface, since view transitions take no refraction and a library adds none."

## Tests

- **Unit** (chromium): whether motion runs (reduced, hidden); springs start at 0 and end at 1; the source's choice; a number noticed with and without a landing; a second landing of one import joins the wave; FLIP deltas with the page scrolled.
- **Stories with an interaction test:** a sort, an opened row and a selected box play the named animations with their durations and end in the final state; `Num` on an import leaves no extra node once done, and its accessible text is the new value throughout.
- **`e2e/motion.spec.ts`**, motion on: a rail press makes one copy, inert and hidden from assistive tech, gone after the wave; a click on the new page during the wave works; two presses in a row leave one copy; Back washes and restores the scroll; a press from a scrolled page keeps its copy until the front is done; run to run never shows the old run's title; showing mode makes no copy (no hidden name left in the DOM); an import with a change in the window starts the wave, one without plays the small ripple, and a landing of `/api/showing` alone starts neither; Mark all seen with a failing POST leaves the list and no copy; scrolling ends the bend; no console error with WebGL2 off; computed durations against the table above; axe after `settled` and after the copy is gone.
- **Reduced motion:** every moment above, no animation but the scroll cue's, no copy, no canvas.
- **Screens:** unchanged baselines, since they run reduced; any that differ are a defect, except the selected box's ring if its element changes its pixels.
- **Performance**, by hand on the real app, not in CI: one committed script that serves the fixtures build and counts frames over 20 ms, both themes, at full speed and slowed 4×, for the page switch, opening a run, an import and opening six rows. It passes at full speed with no frame over 20 ms after the first switch, and at 4× with a median of at most 6 missed frames and no gap over 60 ms. What doesn't pass goes to the owner with its numbers.

## The kit's points

- **Question:** what changed, and where did it come from?
- **Empty, loading, error:** unchanged. A loading state condenses as any panel; its data condenses in turn if the wave still runs, else at once.
- **Widths:** at 375 px the source is the Menu button or the link pressed, the canvas covers the window and nothing scrolls sideways; at 768 and 1440 px as drawn.
- **Screens:** `/`, `/weeks`, `/work`, `/work?view=runs`, `/work?view=sessions`, `/work/goals/<key>`, `/work/changes/<key>`, `/runs/<key>`, `/findings`, `/context`, `/spend`, `/compliance`, `/steps`, `/skills`, `/kits`, `/models`. Their layout doesn't change; with no layout change the kit asks for no capture, and the live mockup is the reference.
- **Components:** adapted: `Shell`, `Menu`, `Brand`, `Num`, `DataList`, `RowToggle`, `Feed`, `HeatmapTable`, `RunFlow`, `StepDetail`, `RunPage`'s title, `useLiveQuery`, the keyed routes. New: the water canvas and the filters, since nothing draws either today.

## Left to the builder

File names inside `motion/`, the shader's and the maps' code (the mockup is the reference), how the numbers' extra nodes are added, and how the source link is remembered.

## Calls I made

Each is mine, to be corrected:

1. Opening a run washes from its link too; in the mockup the owner saw first, only the title travelled.
2. The travelling title is a transform on the real `h1`, not a view transition.
3. An import that changes nothing on screen gets a small ripple only.
4. Showing mode and account switching don't move at all.
5. The refraction is Chromium only; others keep the light and the condensing.
6. The wave keeps the 900 ms the owner was shown, so the page's far corner is readable about 1 s after the press (today: at once).
7. The performance script is run by hand, since CI has no display to measure.

From the builder check:

8. The wash ignores every scroll; only the import's bend ends on one.
9. Run to run, change to change and goal to goal start the page afresh: "Loading the run…" shows for the few milliseconds its data takes, where today the old run's facts stay up.
10. The title travels only if the run is drawn within the wave (900 ms); the graph draws on Back too, and never on a first load.
11. Only what is in the window counts as a change; at most 9 numbers drop, as in the mockup; a change seen only in a chart or a text gets the small ripple.
12. A changed number keeps its old look until the front arrives, as in the mockup the owner saw.
13. Mark all seen plays on copies, after the server's answer.
14. Dialogs, tooltips and the switch's thumb are held to the verbs too (condense, flow).

## Change request for the kit

To `claude-kits`, through its own session, not from here. In `motion.md`:

> **The look's verbs.** A project whose `DESIGN.md` names a material or a world (glass, an arcade cabinet, paper) states its motion as that material's verbs: what leaving, arriving, changing and moving look like. A motion task maps each motion it builds to one verb.

In `direction.md`, step 4, where the Motion section is listed: "with the look's verbs". In `checklist.md`: "**moves like its look:** each motion is one of the verbs the project's `DESIGN.md` names; a generic fade or slide is a finding. Skipped when `DESIGN.md` names none." A captured screenshot can't show motion, so the reviewer needs the motion task's recording or its code; how is the kit's to settle.
