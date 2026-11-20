# Usage % in place of dollars: design

Goal: workflow-reporting

The approved mockups are in `docs/design/2026-11-20-usage-pct/` (Home, Weeks with its tooltip open, Work, a change
page, the goal page, Runs and Sessions with a row opened, a run page; 1440 light and dark, 375 dark, Weeks also 768
dark). They were drawn on a throwaway branch (`claude/usage-pct-mock`) with faked values; this document wins where the
two disagree, and its differences from them are listed under "Calls made after the mockups".

## Intent

The owner manages Claude Code against two weekly plan limits, Fable and all models, and pays a flat plan, not API
credits. What a run, change, session or week cost in dollars is not what they act on; how much of the week's quota it
took is. The workflow's reporter (gilead PR shoklah/gilead#60, `--json` version still 1, keys only added) now exports
that estimate: each message's list-price cost converted at its week's rates, which it calibrates from the
`get_usage` readings in the transcripts. Its design is gilead's
`docs/superpowers/specs/2026-11-20-usage-pct-estimates-design.md`.

Dollars stay where parts of the work are compared with each other (phases, step kinds, agents): there list price
compares more reliably than a calibrated estimate.

## Goals

- Wherever the owner reads "how much did this task or week take", edward shows the all-models % first and the Fable %
  one step away, in place of dollars.
- A total over several units adds the known estimates and says how many units it left out.
- A week's total covers its runs and its sessions, so it comes close to what `get_usage` reads for the week.
- The reporter's weekly calibration is visible, so the owner can judge a week's estimates, and a week whose rates were
  borrowed is marked.

## Non-goals

- Percentages on the Spend page, the run page's phases and agents, the Steps page or the Models page: they keep
  dollars, unchanged.
- Reading the new keys the screens don't use (each `models` entry's, each phase's, each dispatch's and step's
  `fable_pct`/`all_pct`, the scoreboard's): the schema strips them, as it strips every unread field.
- Computing an estimate in edward: the reporter is the only source (`workflow-report.py` is the only parser).
- The run-record points (`fable_points`, `all_points`) on screen: the Weeks page's "Usage (points)" group goes.

## Anti-goals

- An unknown estimate shown as 0. A known 0 (the Fable share of a run that used no Fable) is a real 0.
- A total that hides how much it left out.
- A stale estimate: the current week's estimates move with every export, so a stored one must never outlive the
  export that changed it.

## Approaches

- **A. edward sums the units' own estimates (chosen).** The schema declares the unit-level keys, the import replaces
  them with each transcript read, and totals (a week, a change, a goal, a list) are summed by the same views that sum
  cost today, known values only, with a count of units left out. Every filter (path, project, goal, showing mode's
  scope) keeps working. `totals.usage`, the account-wide calibration, is a reporter figure, read through
  `reporterTotals`.
- **B. Read the reporter's weekly totals.** `totals.weeks` already has `fable_pct`, `all_pct`, `pct_unknown`. It can't
  follow a path or project filter, would count hidden projects' runs in showing mode, and covers runs only.
- **C. Convert cost in edward with `totals.usage`'s rates.** Duplicates the reporter's work against the rule that it
  is the only parser.

## Design

### Data

- **Schema** (`packages/shared/src/report.ts`): run and session entries gain `fable_pct` and `all_pct` (`num`, so
  nullish). `WeekSchema` gains `fable_pct`, `all_pct` and `pct_unknown`, read only by check:real. `TotalsSchema` gains
  `usage`, an array of week rows `{week, readings, pairs, fable: {points, cost, rate, chunks, error, borrowed_from},
  all: {points, fable_cost, other_cost, fable_rate, other_rate, chunks, error, borrowed_from}}`, every field nullish
  but `week`. Nothing else is declared.
- **Merge** (`mergeKnown` in `packages/server/src/db/merge.ts`): the estimates come from the transcript, so a version
  whose `tool_results` isn't null replaces the stored `fable_pct` and `all_pct`, null included, as it already does
  `context`, `goal` and `spec`. A version that didn't read the transcript keeps the stored ones. A stored unit from an
  export older than this change has none, which reads as unknown.
- **Unit sums** (`packages/shared/src/facts.ts`): one helper sums a list of units' estimates into `{all, fable,
  notEstimated}`: each limit the sum of its known values through `addKnown` (null when none is known), and
  `notEstimated` the count of units whose `all_pct` or `fable_pct` is null, the reporter's `pct_unknown` rule. Every
  total below goes through it.

### Totals

- **A week** sums its runs and its sessions, each in its week through `unitWeeks`: `weekSums` gains `allPct`,
  `fablePct` and `notEstimated` (its caller passes the sessions too). Its other sums stay runs only, as the reporter's.
  Home's "Usage per run" is the week's runs' known all-models (and Fable) sum over the number of runs with a known
  value.
- **A change, a goal, a session row, a run row**: the Work views (`views/work.ts`, `sessionRow` in
  `views/sessions.ts`, `runFacts`) carry `allPct`, `fablePct` and, for totals, `notEstimated`, in place of `cost`.
  A session's estimates are its own part only (its transcript's rows outside every run window, as its cost is today);
  its held runs carry the rest and are listed in its opened row, so no total counts anything twice. A goal section's
  total on Work shows the all-models sum, and when its count isn't 0 a not-estimated marker (below), since the row has
  no room for the written count; its page writes the count.
- **The weekly calibration**: the Weeks view reads `totals.usage` through `reporterTotals` and returns it with
  `usageSource: 'reporter'`; the page finds, per limit, the week a row's rates were borrowed from by looking the week
  up in those rows (no row field carries it). With no `totals.usage` (an older export), the section shows its empty line and no
  week is marked.
- **check:real**: a `usage:` line compares, per week, the runs-only estimate sums (the same helper over the week's
  runs) with `totals.weeks`' `all_pct`, `fable_pct` (to 0.01 points, a null read as 0 on both sides) and
  `pct_unknown`, naming the differing weeks as the `weeks:` line does. Its `work:` line compares `all_pct` instead of cost, since cost leaves the Work
  responses. Its week cost and points comparisons stay (the server keeps those sums; the page stops showing them).

### Screens

Numbers in a table cell are plain under a header naming the unit ("All models (%)"), one decimal, through one new
formatter in `format.ts`: a known value above 0 and under 0.05 shows "<0.1", a known 0 shows "0.0" (muted by `Num`), an
unknown one `Unknown`'s dash. Prose, tiles and facts add "%".

| Screen | First glance | One step away | Dollars removed |
|---|---|---|---|
| Runs view (`/work?view=runs`) | "All models (%)" column | "Fable (%)" first fact of the opened row | cost column |
| Sessions view and a change's or goal's sessions (`SessionsByWork`) | "All models (%)" column | "Fable (%)" first fact | cost column |
| Changes table | "All models (%)" column | "Fable (%)", "Not estimated" (left out at 0) | cost column |
| Work's goal sections | all-models sum, with the not-estimated marker when its count isn't 0 | the goal's page | cost total |
| Change page, goal page headers | "All-models usage" | "Fable usage", "Not estimated: N" (left out at 0) | cost fact |
| Run page header | "All-models usage" | "Fable usage" | cost fact |
| Home's feed, a finished run's facts | "All models" pair | – | "Est. cost" |
| Home's "This week" | "Usage this week (%)" and "Usage per run (%)" small tables: All models, Fable rows, This week and Last week columns; "Not estimated" row under this week's when not 0 | – | cost rows |
| Home's chart and Weeks' chart | "All-models usage by week (%)" | table view: Fable and Not estimated columns | cost by week |
| Weeks' By week table | "Est. usage (%)" group: All models, Fable, Not estimated | borrowed marker | cost column, "Usage (points)" group |
| Weeks' new "Usage estimates" section | the calibration table | – | – |

- **Borrowed marker**: a week row whose rates for a limit were borrowed shows, before that limit's value, a muted
  lucide `History` icon (`aria-hidden`) inside a focusable tooltip trigger named, and with the tooltip,
  "Rates borrowed from the week of <week>"; the numbers stay right-aligned. Text, never colour alone.
- **Not-estimated marker** (Work's goal sections only, where no count fits): a lucide `CircleAlert` icon in primary
  ink (the row sits on the backdrop)
  (`aria-hidden`) before the total, inside a focusable tooltip trigger named, and with the tooltip, "N units not
  estimated". Everywhere else the count is written.
- **No other marker**: the current week's estimates move as its rates settle and show as they are; a unit from a
  borrowed week carries no marker outside Weeks (owner, in the grill).
- **Usage estimates** (Weeks, below By week): a glass `Panel` titled "Usage estimates" with `ReporterMark` beside its
  title, one row per week of `totals.usage`, newest first: Week; Readings; a Fable group (Points, Rate ($/pt), Fit
  error (± pt), From); an All models group (Points, Fable rate ($/pt), Other rate ($/pt), Fit error (± pt), From).
  "From" is the week the group's rates were borrowed from, else the dash. Rates show two decimals, errors one. It
  lists the weeks of the page's Period, as every other section of Weeks does (design call), and ignores the path and
  project filters and showing mode's scope, since it is account-wide and names no project. The dev:fixtures
  `totals.usage` puts its borrowed week inside the default 4 weeks.

### Spec points (ui kit)

- **Questions**: Runs, Sessions, Work: "how much of my week did this task take?"; Home: "how much of my quota has this
  week taken, and what does a run take?"; Weeks: "how did my usage go week by week, and can I trust the estimates?".
- **States**: empty and loading unchanged; an export from before this change has no estimates, so every cell shows the
  dash, every "Not estimated" counts all units, and Usage estimates shows "No usage estimates in this export." (the
  page's error state is unchanged).
- **Widths**: 1440 as captured; below 768 the lists fold their All models column into the opened row, as cost folded
  before; at 375 the By week and Usage estimates tables scroll in their own named regions with the edge fade.
- **Screens**: `/`, `/weeks`, `/work`, `/work?view=runs`, `/work?view=sessions`, a change page, a goal page, a run page
  (the plan names the fixture keys).
- **Components**: existing: `DataList`, `Num`, `Unknown`, `Pairs`, `Panel`, `Section`, `GroupHead`, `ReporterMark`,
  `Term`/`Tooltip`, `HeatmapTable` untouched, `Chart`. Adapted: `RunsTable`, `SessionsTable`, `SessionsByWork`,
  `ChangesTable`, `WorkPage`, `ChangePage`, `GoalPage`, `RunPage`'s header, `Feed`, `WeekTiles`, `WeeklyCharts`,
  `WeeksPage`. New: none beyond the formatter; the borrowed marker is a `Term` with an icon in place of text.

### Fixtures

Every `report-*.json` fixture's runs and sessions gain invented `fable_pct`/`all_pct`, a few null and some Fable 0;
their `totals.weeks` rows gain `fable_pct`, `all_pct` and `pct_unknown` that agree with their runs by the reporter's
rule; the fixture dev:fixtures loads last gains a `totals.usage` with at least one borrowed week. The fixture-totals
convention in `CLAUDE.md` gains the rule.

### Conventions this adds to `CLAUDE.md`

- A unit's usage estimates are the reporter's `all_pct` and `fable_pct`; a total over units comes only from the one
  helper in `facts.ts` (known values summed, `notEstimated` the units with either null), and a week's covers its runs
  and its sessions, unlike `weekSums`' other sums.
- Spend reads as usage % wherever a task or week is measured (Runs, Sessions, Work, the run header, Home, Weeks) and as
  dollars wherever parts are compared (Spend, phases, Steps, agents, Models).
- The reporter figures list gains `totals.usage` (Weeks' Usage estimates and its borrowed markers).
- The `mergeKnown` line gains `fable_pct` and `all_pct` beside `context`, `goal` and `spec`.

## Calls made after the mockups

- One "Not estimated" count everywhere (units with either estimate null, the reporter's rule) instead of the mock's
  separate all-models and Fable counts on the Changes table.
- Usage estimates follows the Weeks page's Period, as the page's other sections do.
- Usage estimates gets a "From" column in each group instead of one "Borrowed from" column, since the reporter borrows
  Fable and all-models rates apart.

- Work's goal sections get the not-estimated icon marker (owner, in the grill), which the mockups don't show.

## Left to the builder

- Field names in the response types, and how `weekSums`' caller passes sessions.
- The formatter's name and where the run page's and feed's facts sit among their neighbours.
- Which fixtures carry which invented values, within the rules above.
