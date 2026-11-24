# Kit pages: does a kit help, and what does it cost?

Status: draft, not approved. Goal: kits. Issue: shoklah/claude-workflow-dashboard#22. Path: Full (new facts in the import's schema, a new view, route and page, showing mode, `check:real`, fixtures). Captures: `docs/design/2026-11-24-kit-pages/`, rendered on the real components with invented data, from a throwaway worktree cut from `main` at `8ceaa27`. The owner approved them on 2026-11-24 ("make sense for now, we'll see once there will be more kits"); the Kits page's were re-rendered the same day with the changes named under "After the approval".

## Intent

A kit specializes the workflow for a topic: it adds guidance, checks and a review of its own to the tasks that need it. Run records and `--json` carry which kit ran on which task, its review with its findings, its checks' results and its warnings. The dashboard shows only the kit review's boxes on the run page.

The question these pages answer: **does a kit help, and what does it cost?** The owner wants it to lead to two decisions: what to change in a kit's checklist, and where a kit should run.

## Goals

- One page, `/kits`, for every kit, one kit at a time.
- It compares the kit's review with the task and final reviews of the same runs: what each found, what was acted on, and what it cost.
- It shows each checklist line's findings and how they ended, and lists them.
- It shows where the kit ran (project and path), and whether a new version of it did better.
- The run page says which kit and version a task carried, how its checks ended, and what its kit review cost.
- Kit warnings have their family on Compliance, and a kit finding shows its checklist line wherever it is listed.

## Non-goals

- A page per kit. The owner ruled it out: one page with a kit filter serves every kit today.
- A trend chart. There are three weeks of data; By version stands in. To look at again once there are more kits (the owner).
- Steps and rules, Spend, Findings, Home, Weeks, Work: unchanged, apart from the opened finding's new fact.
- Screenshots. The export has local paths the page could not open.
- Exempt tasks and the plan records that name a kit.
- A checklist line with no finding: the export names lines only through findings.

## Anti-goals

- A fact read out of a warning's text, a branch or a path. A warning's kit is not exported and is not worked out.
- A kit's cost that counts a dispatch twice, or one that lumps the kit's re-checks into the task review's.
- Figures of two kits added together: lines and versions of different kits have nothing in common.

## Constraints

- The data rules hold: every fact comes from the reporter; nothing is parsed here; a missing fact is unknown, never zero.
- The facts are there already, in `unit_versions` and the merged units, since unread keys are kept raw. Once the schema reads them, old runs fill in with no resync. Checked on a local database, counts only: 33 runs with `kits`, 27 with `kit_checks`, the kit on 69 of 69 kit reviews and the label on 112 of 112 kit findings.
- No dependency is added. `DESIGN.md` and the project's `## Code conventions` hold.
- `kits[].files` holds absolute paths; it is never read into the schema.

## What the workflow supplies, and what was asked

What the reporter exports (schema 6 and later, Small and Full runs):

| Fact | Where |
|---|---|
| The kits a run used: `name`, `version`, `tasks` (empty on a Small run, where the kit covers the branch) | `run.kits` |
| Each kit task's last check result: `kit`, `task` (absent on a Small run), `result` (`passed`, `failed`, `couldnt_run`) | `run.kit_checks` |
| The kit of a kit review, or of a re-check `kit-reviewer` ran (a `fix_check` or `final_fix_check`) | `step.kit` (read today) |
| A kit finding's checklist line | `finding.label` |
| Six warning kinds, run-level: `kit_unrecorded`, `kit_review_missing`, `kit_check_missing`, `kit_unverified` (last result not passed), `kit_rules_unread`, `kit_file_unread` | `run.warnings` |

A step has no cost of its own; its tied dispatch has. There is no kit total in `totals`.

Change requests, as the owner settled them on 2026-11-24:

- Every check result, not only the last: shoklah/gilead#68, filed. Until it lands the page counts last results and says so in its header ("Checks, last result").
- The owner's decision on a `to_owner` finding: asked as a comment on shoklah/gilead#43. Until then To owner is a column of its own.
- Not asked: a kit's checklist lines, exempt tasks, the kit on each dispatch, where screenshots are.

## Approaches

| Approach | For | Against |
|---|---|---|
| **A. One Kits page with a kit filter** (picked) | One place for both decisions; works for any kit with no change | A kit can't have figures of its own |
| B. A list of kits and a page per kit | Room for kit-specific figures | A second level for one kit today; nothing yet needs it |
| C. No new page: facts spread on Steps, Findings and Spend | Smallest | Neither decision can be taken from any one page |

The owner picked A.

## Decisions the owner made

1. The page answers both what to change in a kit's checklist and where a kit should run.
2. One Kits page for every kit, with a kit filter; no kit-specific page.
3. The mockups, "for now": to look at again once there are more kits.
4. The change requests above.

## The design

### Which runs and which kit

- Only **Small and Full runs** count. A plan record only names the kit.
- A run **uses a kit** when its `kits` names it or one of its steps carries it. The second keeps a run whose record forgot the kit; its version is then unknown.
- The period, path and project filters are the other list pages' (`ListFilters`, `periodQuery`, `period`). A run counts in the week it finished. The Path filter's other values match no run here, and the page shows its empty state.
- **The Kit filter** lists every kit a stored Small or Full run uses, by name, with no "All". It opens on the kit with the most runs in the period (ties, and a period with none: the first by name). It is a query parameter of the API, `kit`; a name no stored run uses gives the default kit's response. The page holds it as the list pages hold their filters.

### The Kits page, `/kits` (`kits-*`)

Menu section Workflow, after Skills, lucide `Package`. The title, the filters, then five sections, in this order. The page has no explanatory text; its only lines are the states' below.

**1. Reviews in the kit's runs.** Three rows: Kit review, Task review, Final review (`STEP_LABELS`), over every such step of the kit's runs, the task reviews of tasks without the kit included.

| Column | Value |
|---|---|
| Ran | The steps of that kind. For Kit review, those carrying the kit. |
| Found nothing | Those whose counts are all zero, as Steps and rules counts "found". |
| Critical, Important, Minor: Found | Its findings of that severity, the ruled one. A final review's `unneeded` items are left out. |
| Critical, Important, Minor: Acted on (%) | Of those, the acted-on group's share (`fixed`, `applied`); the dash when none was found. |
| Not valid | Those three severities' findings the workflow judged `invalid` (`validity` alone, never the app's relevance). |
| Re-checks | Kit review: `fix_check` and `final_fix_check` steps carrying the kit. Task review: `fix_check` steps with no kit. Final review: `final_fix_check` steps with no kit. |
| Est. cost ($) | The reviews and those re-checks (below). |

A severity ruled after the report can make Found differ from the Steps page, which counts the reports' count lines.

**2. Checklist lines.** One row per label of the kit's review findings in the period, most findings first, then by name; a finding with no label goes in one row, the dash read "no line". Found: Critical, Important, Minor, Total. How they ended, which adds up to Total: Acted on (`fixed`, `applied`), Deferred, To owner, Open (`open` or no outcome), No action (`declined`, `ruled`, `not_built`). Then the share acted on (`ShareBar`, of Total), then Not valid.

A line's name is a button (`aria-pressed`, the link's underline). Choosing it marks its row and shows its findings under the table in `FindingsTable` with the runs, headed `12 findings of "Every width"`, with its Severity and Outcome filters and without Step (every one is a kit review's). Choosing it again closes the list, and changing a filter or the kit clears the choice.

**3. Where it ran.** One item per project (`Lines`), one line per path (Full, then Small), only the paths it ran on; most runs first. Runs; Tasks (the sum of `tasks`' lengths; the dash on Small and for a run whose record doesn't name the kit); Reviews; Found nothing; Critical and important: Found, Acted on (%); Minor: Found, Acted on (%); Re-checks; Est. cost ($); Share of run cost (%): the kit's cost over the cost of the same runs (`modelsCost`), counting only runs with a known cost on both sides, the dash when there is none.

**4. By version.** One row per version, newest first (by its newest run's finish). Runs, Reviews, Found nothing, Findings per review (one decimal, the three severities), Critical and important, Minor (as above), and Checks, last result: Passed, Failed, Couldn't run (`kit_checks` of the kit; a run that carries none adds nothing, since it recorded no result, and its `kit_check_missing` warning says so). An unknown version is the dash, read "not known", and last.

**5. Warnings.** The current warnings of the six kit kinds on the period's Small and Full runs that use the chosen kit, or that use no kit at all (a run whose plan marks a kit but whose record and steps name none: it shows under every kit, since a warning doesn't carry one). A `DataList`: Kind (names the row), Run (`RunLink`), Project, Since you last looked; the warning's text in the opened row. Newest run first. Resolved ones stay on Compliance.

### Cost

A dispatch is a kit's when its `kind` is `kit_review` or its `agent` is `kit-reviewer`. Its kit is its tied step's `kit`, else the run's only kit, else none (two kits and no tie: it is in no kit's cost). The cost is `addKnown` over `modelsCost` of each, a final review pair's second half left out as everywhere. A task review's cost is the `task_review` dispatches and the `fix_check` ones that aren't a kit's; a final review's the `final_review` and `final_fix_check` ones that aren't a kit's. So the kits' `kit_review` costs, and what is in no kit's, add up to the Steps page's, and no dispatch counts in two rows. A Re-check or a Ran count comes from steps, a cost from dispatches: an untied one costs without a step.

### The run page (`run-kit-review-*`, `run-not-verified-*`)

- **Step detail:** a facts line (`Pairs inline="beside"`) under the head, on a kit task's box and on a kit review's: Kit, Version, Kit checks (the last result: "Passed", or "Failed" or "Couldn't run" in the warning ink), and on a kit review Est. cost (its dispatch and its re-checks' in that box). A fact that isn't known is left out. A box gets them when its task is in a kit's `tasks`, or when it is a kit's own; on a Small run, that is the task-less Kit review box, whose check is the one with no task.
- **Chip:** on the kit task's own box (the Small run's Kit review box), a chip in the warning ink, before the outcomes' chips: "Not verified" when its last result is `couldnt_run`, "Checks failed" when it is `failed`. A task with two kits gets a facts line per kit and at most one chip of each wording.
- No new panel, fold or header fact.

### Other pages

- **Compliance:** a Kits family, after Steps and record, its six kinds in the order of the table above. Labels: "Kit not recorded", "Kit review missing", "Kit checks not run", "Kit checks not passed", "Kit rules not read", "Kit file not read". Today these kinds fall under Other.
- **A finding's opened row** (run page, Findings, Kits): a "Checklist line" fact after Category, left out when the finding has no label.

### Showing mode

As every view: sums count every project; only lists are filtered.

- Kit names, versions and checklist lines are text from units: `maskText` before summing, so everything, the Kit filter's values included, is keyed by the masked name and a guessed hidden name matches nothing. Two kits whose names mask to the same text merge, as masked names do on every view: the one exception to the anti-goal.
- Where it ran names the shown projects and sums the hidden ones into one last item, "Other projects", by path: a new shape for a view, needed so its rows add up to the section above.
- The listed findings and warnings are the shown projects' runs'; a line says how many are hidden (`hiddenLabel`), as on Findings and Compliance.
- Kit warnings join a family, so Compliance now lists them with a scope, masked as the others.
- `views/kits.ts` gets the `leaks` check.

### States

- **Loading:** "Loading the kits…". **Error:** "Couldn't load the kits. Check that the dashboard server is running, then refresh."
- **No kit in any stored run:** "No kit has run yet. A kit shows here once a run that uses one is imported." and no Kit filter.
- **The kit ran in none of the period's runs:** "The ui kit ran in none of these runs." in place of the first four sections. In both of these states Warnings still shows when it has any.
- **No finding by the kit's reviews:** Checklist lines' empty row, "No findings".
- **No warning:** "No kit warnings in these runs."

Each line stays because nothing drawn says it.

### At each width

- **1440 px:** as captured.
- **768 and 375 px:** the filters wrap; the four tables scroll in their own named regions with the edge cue; the two lists fold their narrow columns. No page scrolls sideways.

### After the approval

Changed in the captures after the owner approved them, each so a number is not missing or misread: a Critical column on Checklist lines and "Critical and important" as the first group of the two last tables (the reviewer can give Critical; none has been given yet); a Re-checks column on the reviews, since their cost includes them; "Kit checks not passed" for the warning's kind, since it also covers a failed check; and the 12 findings drawn.

## Screens

`/kits`, `/runs/<a fixture run's key with a kit>`, `/compliance`, `/findings`.

## Components

| Component | Where | Status |
|---|---|---|
| `KitsPage` | `kits/` | New page. Its five sections are existing parts. |
| The Found and Acted on pair of columns | `kits/` | New, small: three tables repeat them. No existing component holds two numeric sub-columns under a `GroupHead`. |
| `FindingsTable` | `runs/` | Adapted: the Checklist line fact. |
| `StepDetail`, `RunFlow`, `flow.ts` | `runs/` | Adapted: the facts line, the chip. |
| `Menu`, `router.tsx`, `format.ts` (`KIND_LABELS`, `FAMILY_LABELS`) | | Adapted. |
| `ListFilters`, `DataList`, `Lines`, `Num`, `GroupHead`, `ShareBar`, `Pairs`, `Section`, `PageTitle`, `RunLink`, `WarningText`, `Text`, `EmptyRow`, `State`, `Line`, `Table` | | Existing. |

## Data and checks

- **Schema** (`report.ts`): `kits` (`name`, `version`, `tasks`), `kit_checks` (`kit`, `task`, `result`) on a run, `label` on a finding; all nullish.
- **View:** `kitsView` in `packages/server/src/views/kits.ts`, its response in `packages/shared/src/api/kits.ts`, its route `GET /api/kits` in `registerRoutes`.
- **`FindingRow`** gains `label` (masked in `runView`); the run page's response gains its kits, its check results and each step's cost, for the kit steps only.
- **Fixtures:** a new `report-kits.json`, imported by dev:fixtures just before `report-work.json` (a run's warnings stay current when a later export lacks the run): two kits, Small and Full runs in two projects, two versions, check results of the three kinds, findings of several lines and outcomes, a kit review with no tie, a run whose record forgot its kit, kit warnings; its totals agree. Invented text only.
- **`check:real`:** a line `kits: N compared, M differ`: over every run, the kit reviews that ran, summed over kits, and their dispatches' cost, plus those in no kit, against the scoreboard's `kit_review` row (cost to the cent); counts only, and `not in the export` with no such row. Its showing check also fetches `/api/kits` for each kit.
- **Tests:** the view's on fixtures (each section's sums, the filter's default, unknown version, a run with a step but no `kits`, the untied dispatch, the scope and its leaks); stories for the page's empty, full, loading and error states and for the run page's facts line and chips; e2e axe and the three widths (`shell.spec.ts`), screens for `/kits`.

## Left to the builder

- The response type's shape and how the view's sums are cut; reuse `addCount`, `addKnown`, `modelsCost`, `OUTCOME_GROUPS`, `foundFindings`' neighbours in `facts.ts` before writing.
- Whether the warnings' columns are Compliance's with Kind in front, or their own.
- How the plan is cut. A natural order: schema and fixture; the view with its route; the page; the run page; Compliance and the finding's fact; `check:real`.
- The `## Code conventions` lines this design settles: when a run uses a kit, the cost rule, the one place a kit's figures are summed, "Other projects", the Kits family, the chip.
