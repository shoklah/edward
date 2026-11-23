import { toPath, type Outcome, type Path, type RunEntry, type SessionEntry, type Step } from './report.ts';

export type FindingSplit = { total: number; actedOn: number; notActedOn: number; open: number };

export type RunFacts = {
  key: string;
  projectKey: string;
  project: string;
  branch: string | null;
  headline: string | null;
  path: Path | null;
  stage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  minutes: number | null;
  cost: number | null;
  allPct: number | null;
  fablePct: number | null;
  findings: FindingSplit;
  warnings: number;
  stops: number | null;
  tasks: number | null;
  waves: number;
  beforeSteps: boolean;
};

/** Each outcome's group (`none`: no outcome): acted on, closed with no action or left for later; in the run graph's chip
 * order. Closed with no action is narrower than `splitFindings`' not acted on, which holds deferred and to_owner too. */
export const OUTCOME_GROUPS: Record<Outcome | 'none', 'acted_on' | 'no_action' | 'left_for_later'> = {
  fixed: 'acted_on',
  applied: 'acted_on',
  deferred: 'left_for_later',
  to_owner: 'left_for_later',
  open: 'left_for_later',
  declined: 'no_action',
  ruled: 'no_action',
  not_built: 'no_action',
  none: 'left_for_later',
};

// A session ID, and a session transcript's file name, as the reporter writes it in a session warning.
export const SESSION_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const SESSION_FILE = new RegExp(`(${SESSION_ID.source})\\.jsonl`, 'i');

/** Every finding of every step: acted on by its outcome's group, open = open, not acted on = any other outcome; a
 * finding with no outcome counts in total only. */
export function splitFindings(steps: Step[]): FindingSplit {
  const split = { total: 0, actedOn: 0, notActedOn: 0, open: 0 };
  for (const finding of steps.flatMap((step) => step.findings ?? [])) {
    split.total += 1;
    const outcome = finding.outcome;
    if (!outcome) continue;
    if (outcome === 'open') split.open += 1;
    else if (OUTCOME_GROUPS[outcome] === 'acted_on') split.actedOn += 1;
    else split.notActedOn += 1;
  }
  return split;
}

/** A warning's text with its first `<uuid>.jsonl` written `{session}`, and that UUID; the text as is when it has none. */
export function splitSessionId(text: string): { text: string; sessionId: string | null } {
  const match = SESSION_FILE.exec(text);
  if (!match) return { text, sessionId: null };
  return { text: text.replace(match[0], '{session}'), sessionId: match[1] };
}

/** A run's findings, every one; null for a record from before steps, which has no findings to count. */
export function foundFindings(run: Pick<RunFacts, 'findings' | 'beforeSteps'>): number | null {
  return run.beforeSteps ? null : run.findings.total;
}

/** A run's closed findings: acted on + not acted on, the findings with an outcome other than open; null for a record
 * from before steps, which has no findings to count. */
export function closedFindings(run: Pick<RunFacts, 'findings' | 'beforeSteps'>): number | null {
  return run.beforeSteps ? null : run.findings.actedOn + run.findings.notActedOn;
}

// A sum of known values: null until one is known.
export const addKnown = (sum: number | null, value: number | null | undefined) => (value == null ? sum : (sum ?? 0) + value);

/** A unit's `models` map's cost: null with no map or no priced entry, otherwise the sum of its entries' non-null
 * cost. */
export function modelsCost(models: RunEntry['models']): number | null {
  return models ? Object.values(models).reduce<number | null>((sum, m) => addKnown(sum, m.cost), null) : null;
}

/** A total of units' usage estimates: each limit's known values summed (null when none is known), and the units
 * with either estimate unknown. */
export type Estimates = { all: number | null; fable: number | null; notEstimated: number };

/** Units' usage estimates summed, as the reporter's week_rows sums them (`pct_unknown` its `notEstimated`). */
export function estimateSum(units: { all_pct?: number | null; fable_pct?: number | null }[]): Estimates {
  const sum: Estimates = { all: null, fable: null, notEstimated: 0 };
  for (const unit of units) {
    sum.all = addKnown(sum.all, unit.all_pct);
    sum.fable = addKnown(sum.fable, unit.fable_pct);
    if (unit.all_pct == null || unit.fable_pct == null) sum.notEstimated += 1;
  }
  return sum;
}

/** A unit's or a week's tool results summed over every class, 0 when the map is null. */
export function toolCharacters(toolResults: Record<string, number> | null | undefined): number {
  return Object.values(toolResults ?? {}).reduce((sum, characters) => sum + characters, 0);
}

/** The `read` class's share, as a percent (0 to 100), of a unit's or a week's tool results summed over every class;
 * null when the map is null or sums to 0. */
export function readShare(toolResults: Record<string, number> | null | undefined): number | null {
  const total = toolCharacters(toolResults);
  return total ? ((toolResults?.read ?? 0) / total) * 100 : null;
}

/** A unit's context facts as both its run page and the Context page show them: its main calls, their median and largest
 * tokens, the calls past the cap, the handoff's time, its read share and its sweeps by kind. */
export type ContextFacts = {
  calls: number;
  medianTokens: number | null;
  maxTokens: number | null;
  callsOverCap: number;
  handoff: string | null;
  readShare: number | null;
  sweeps: { inline: number; delegated: number };
};

/** A run's or session's context facts, an unknown count 0; null when the unit has no `context`. */
export function contextFacts(unit: RunEntry | SessionEntry): ContextFacts | null {
  const context = unit.context;
  if (!context) return null;
  return {
    calls: context.calls ?? 0,
    medianTokens: context.median_tokens ?? null,
    maxTokens: context.max_tokens ?? null,
    callsOverCap: context.calls_over_cap ?? 0,
    handoff: context.handoff ?? null,
    readShare: readShare(unit.tool_results),
    sweeps: { inline: unit.sweeps?.inline ?? 0, delegated: unit.sweeps?.delegated ?? 0 },
  };
}

/** A run's facts but its keys, each taken from its run entry as the reporter gives it; a view adds the stored key and
 * the project's key and name. */
export function runFacts(run: RunEntry): Omit<RunFacts, 'key' | 'projectKey'> {
  const record = run.record;
  const path = toPath(record?.path) ?? null;
  return {
    // project: the last segment of record.project, so no path leaves the backend.
    project: (record?.project ?? '').split('/').filter(Boolean).at(-1) ?? '',
    branch: record?.branch ?? null,
    // headline: the run's one-line title.
    headline: run.headline ?? null,
    path,
    stage: record?.stage ?? null,
    startedAt: record?.started ?? null,
    // finishedAt: the record's date, the time the run finished.
    finishedAt: record?.date ?? null,
    // minutes: the reporter's run time, from started to date.
    minutes: run.minutes ?? null,
    // cost: modelsCost, null with no models (no window) or no priced model.
    cost: modelsCost(run.models),
    // allPct, fablePct: the reporter's usage estimates, in percent of the weekly limits.
    allPct: run.all_pct ?? null,
    fablePct: run.fable_pct ?? null,
    findings: splitFindings(run.steps ?? []),
    // warnings: the number of the run's warns.
    warnings: run.warns?.length ?? 0,
    // stops: record.stops.
    stops: record?.stops ?? null,
    tasks: record?.tasks ?? null,
    // waves: the length of waves.
    waves: run.waves?.length ?? 0,
    // beforeSteps: schema < 2, a record from before steps were logged; a missing schema is 1, as in the reporter.
    beforeSteps: (run.schema ?? 1) < 2,
  };
}
