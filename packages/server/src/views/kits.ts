import {
  addKnown,
  modelsCost,
  OUTCOME_GROUPS,
  splitFindings,
  toPath,
  type Finding,
  type Found,
  type KitFinding,
  type KitLine,
  type KitPath,
  type KitsQuery,
  type KitsResponse,
  type KitVersion,
  type KitWarning,
  type ReviewSums,
  type RunEntry,
  type Step,
} from '@cwd/shared';
import { categoryLabels, type ActiveList } from '../categories.ts';
import type { StoredLabel } from '../db/labels.ts';
import type { StoredUnit, StoredWarning } from '../db/read.ts';
import { familyOf } from './compliance.ts';
import { currentWarnings, finishTime, newSince, period, runView, storedFacts, storedNames } from './runs.ts';
import { maskText, showFacts, showWarning, type Scope } from './scope.ts';
import { foundSomething } from './steps.ts';

type Dispatch = NonNullable<RunEntry['dispatches']>[number];
type ReviewStep = KitsResponse['reviews'][number]['step'];

const REVIEWS: ReviewStep[] = ['kit_review', 'task_review', 'final_review'];

// Each kind of review's re-checks.
const RECHECKS: Record<ReviewStep, string[]> = {
  kit_review: ['fix_check', 'final_fix_check'],
  task_review: ['fix_check'],
  final_review: ['final_fix_check'],
};

/** A run with its kits' names and versions, its checks' and steps' kits and its findings' labels masked (maskText). */
export function maskKits(scope: Scope | null, run: RunEntry): RunEntry {
  return {
    ...run,
    kits: run.kits?.map((k) => ({ ...k, name: maskText(scope, k.name), version: maskText(scope, k.version) })),
    kit_checks: run.kit_checks?.map((c) => ({ ...c, kit: maskText(scope, c.kit) })),
    steps: run.steps?.map((s) => ({
      ...s,
      kit: maskText(scope, s.kit),
      findings: s.findings?.map((f) => ({ ...f, label: maskText(scope, f.label) })),
    })),
  };
}

/** The kits a Small or Full run uses: those its `kits` names, then those only its steps carry; none on any other run. */
export function kitsOf(run: RunEntry): string[] {
  const path = toPath(run.record?.path);
  if (path !== 'small' && path !== 'full') return [];
  const names = [...(run.kits ?? []).map((k) => k.name), ...(run.steps ?? []).map((s) => s.kit)];
  return [...new Set(names.flatMap((name) => name ?? []))];
}

/**
 * The cost of the run's dispatches `of` keeps, given each one's kit: its tied step's, else the run's only one, else null
 * (a kit's dispatch in no kit's cost), undefined for a dispatch that isn't a kit's; a pair's second half left out.
 */
export function dispatchCost(
  run: RunEntry,
  of: (dispatch: Dispatch, kit: string | null | undefined) => boolean,
): number | null {
  const kits = kitsOf(run);
  const only = kits.length === 1 ? kits[0] : null;
  const kitOf = (d: Dispatch) =>
    d.kind === 'kit_review' || d.agent === 'kit-reviewer' ? (run.steps?.[d.step ?? -1]?.kit ?? only) : undefined;
  return (run.dispatches ?? [])
    .filter((d) => !d.pair && of(d, kitOf(d)))
    .reduce<number | null>((sum, d) => addKnown(sum, modelsCost(d.models)), null);
}

const invalidIn = (findings: Finding[]) => findings.filter((f) => f.validity === 'invalid').length;

/**
 * A kind of review over the runs: for the kit's, the steps carrying `kit`, their re-checks and the kit's dispatches
 * (with a null `kit`, those in no kit); for the others, every step of the kind, the re-checks with no kit and the
 * dispatches that aren't a kit's.
 */
export function reviewSums(runs: RunEntry[], kit: string | null, step: ReviewStep): ReviewSums {
  const ofKit = step === 'kit_review';
  const steps = runs.flatMap((run) => run.steps ?? []);
  const carries = (s: Step) => (s.kit ?? null) === (ofKit ? kit : null);
  const ran = steps.filter((s) => s.step === step && (!ofKit || carries(s)));
  const findings = ran.flatMap((s) => s.findings ?? []);
  const of = (severity: string) => findings.filter((f) => f.severity === severity);
  const found = (severity: string): Found => {
    const { total, actedOn } = splitFindings([{ findings: of(severity) }]);
    return { found: total, actedOn };
  };
  const costs = (d: Dispatch, k: string | null | undefined) =>
    ofKit ? k === kit : k === undefined && [step, ...RECHECKS[step]].includes(d.kind ?? '');
  return {
    ran: ran.length,
    foundNothing: ran.filter((s) => !foundSomething(s.counts ?? {})).length,
    critical: found('critical'),
    important: found('important'),
    minor: found('minor'),
    invalid: invalidIn(['critical', 'important', 'minor'].flatMap(of)),
    rechecks: steps.filter((s) => RECHECKS[step].includes(s.step ?? '') && carries(s)).length,
    cost: runs.reduce<number | null>((sum, run) => addKnown(sum, dispatchCost(run, costs)), null),
  };
}

// The items under each key, in first-seen order.
function groupBy<K, T>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

const nullLast = (a: string | null, b: string | null) => Number(a === null) - Number(b === null);
// By name, null last.
const byName = (a: string | null, b: string | null) => nullLast(a, b) || (a ?? '').localeCompare(b ?? '');

/** A checklist line's findings, by severity and by how they ended. */
function lineOf(label: string | null, findings: Finding[]): KitLine {
  const severity = (name: string) => findings.filter((f) => f.severity === name).length;
  const group = (name: string) => findings.filter((f) => OUTCOME_GROUPS[f.outcome ?? 'none'] === name);
  const left = group('left_for_later');
  const deferred = left.filter((f) => f.outcome === 'deferred').length;
  const toOwner = left.filter((f) => f.outcome === 'to_owner').length;
  return {
    label,
    critical: severity('critical'),
    important: severity('important'),
    minor: severity('minor'),
    total: findings.length,
    actedOn: group('acted_on').length,
    deferred,
    toOwner,
    open: left.length - deferred - toOwner,
    noAction: group('no_action').length,
    invalid: invalidIn(findings),
  };
}

// The run's own entries for the kit; none when its record forgot it.
const entriesOf = (run: RunEntry, kit: string | null) => (run.kits ?? []).filter((k) => k.name === kit);

/** A project's runs of one path: the kit's reviews, the tasks that carry it and its share of their cost. */
function pathOf(path: KitPath['path'], runs: RunEntry[], kit: string | null): KitPath {
  // Only the runs whose kit cost and own cost are both known.
  let cost = 0;
  let total = 0;
  for (const run of runs) {
    const kitCost = dispatchCost(run, (_, k) => k === kit);
    const runCost = modelsCost(run.models);
    if (kitCost === null || runCost === null) continue;
    cost += kitCost;
    total += runCost;
  }
  const entries = runs.flatMap((run) => entriesOf(run, kit));
  return {
    path,
    runs: runs.length,
    tasks: path === 'small' ? null : entries.reduce<number | null>((n, k) => addKnown(n, k.tasks?.length), null),
    ...reviewSums(runs, kit, 'kit_review'),
    share: total ? (100 * cost) / total : null,
  };
}

/** A version's runs: the kit's reviews and its last check results. */
function versionOf(version: string | null, runs: RunEntry[], kit: string | null): KitVersion {
  const checks = runs.flatMap((run) => run.kit_checks ?? []).filter((c) => c.kit === kit);
  const ended = (result: string) => checks.filter((c) => c.result === result).length;
  return {
    version,
    runs: runs.length,
    ...reviewSums(runs, kit, 'kit_review'),
    checks: { passed: ended('passed'), failed: ended('failed'), couldntRun: ended('couldnt_run') },
  };
}

/**
 * The Kits page: every kit a stored Small or Full run uses (kitsOf), by name, and over the period's runs (period) that
 * use one of them, the query's `kit` or else the one with the most runs, the first by name on a tie: its reviews beside
 * the task and final reviews (reviewSums), its findings by checklist line, its runs by project and path and by version,
 * and its findings (runView) and current Kits family warnings, newest run first. Every run goes through maskKits first,
 * so with a scope names that mask alike merge and the sums count every project: the hidden ones' runs are one last
 * project, null, and the two lists hold only the shown projects' runs', counting those left out.
 */
export function kitsView(input: {
  runs: StoredUnit<RunEntry>[];
  warnings: StoredWarning[];
  labels: Map<string, StoredLabel>;
  list: ActiveList | null;
  query: KitsQuery;
  now: Date;
  seenAt: Date | null;
  scope: Scope | null;
}): KitsResponse {
  const { labels, list, query, seenAt, scope } = input;
  const names = storedNames(input.runs);
  const { matches } = period(query, input.now, scope);
  const all = input.runs.map((unit) => {
    const entry = maskKits(scope, unit.merged);
    return { unit, entry, facts: storedFacts(unit, names), kits: kitsOf(entry) };
  });
  const kits = [...new Set(all.flatMap((run) => run.kits))].sort(byName);
  const inPeriod = all.filter((run) => matches(run.facts));
  const using = (kit: string) => inPeriod.filter((run) => run.kits.includes(kit));
  const kit =
    kits.find((name) => name === query.kit) ??
    [...kits].sort((a, b) => using(b).length - using(a).length)[0] ??
    null;

  const runs = (kit === null ? [] : using(kit))
    .sort((a, b) => finishTime(b.facts) - finishTime(a.facts))
    .map((run) => ({ ...run, shown: showFacts(scope, run.facts) }));
  const entries = runs.map((run) => run.entry);

  const kitReview = (s: Pick<Step, 'step' | 'kit'>) => s.step === 'kit_review' && s.kit === kit;
  const kitFindings = entries.flatMap((run) => (run.steps ?? []).filter(kitReview).flatMap((s) => s.findings ?? []));
  const findings = runs.flatMap(({ unit }): KitFinding[] => {
    // runView masks the stored run itself, and gives null for a hidden project's.
    const view = runView(unit, [], names, scope, labels, list);
    if (!view) return [];
    const { project, branch, headline } = view.facts;
    return view.findings.filter(kitReview).map((f) => ({ ...f, runKey: unit.key, project, branch, headline }));
  });

  const isNew = newSince(seenAt);
  const current = currentWarnings(runs.map((run) => run.unit), [], input.warnings).filter(
    (w) => familyOf(w.warningKind) === 'kits',
  );
  const warnings = runs.flatMap(({ unit, shown }): KitWarning[] => {
    if (!shown) return [];
    const { project, branch, headline } = shown;
    return current
      .filter((w) => w.key === unit.key)
      .map((w) => ({
        kind: w.warningKind,
        ...showWarning(scope, w.text),
        runKey: unit.key,
        project,
        branch,
        headline,
        isNew: isNew(w.firstSeenAt),
      }));
  });

  const projects = groupBy(runs, ({ shown }) => shown?.projectKey ?? null);
  const versions = groupBy(entries, (run) => entriesOf(run, kit)[0]?.version ?? null);
  return {
    kits,
    kit,
    reviews: (runs.length ? REVIEWS : []).map((step) => ({ step, ...reviewSums(entries, kit, step) })),
    lines: [...groupBy(kitFindings, (f) => f.label ?? null)]
      .map(([label, of]) => lineOf(label, of))
      .sort((a, b) => b.total - a.total || byName(a.label, b.label)),
    findings,
    hiddenFindings: kitFindings.length - findings.length,
    projects: [...projects]
      .map(([, of]) => ({ project: of[0].shown?.project ?? null, of }))
      .sort((a, b) => nullLast(a.project, b.project) || b.of.length - a.of.length || byName(a.project, b.project))
      .map(({ project, of }) => ({
        project,
        paths: (['full', 'small'] as const).flatMap((path) => {
          const onPath = of.filter((run) => run.facts.path === path).map((run) => run.entry);
          return onPath.length > 0 ? [pathOf(path, onPath, kit)] : [];
        }),
      })),
    versions: [...versions]
      .map(([version, of]) => versionOf(version, of, kit))
      // In first-seen order, so newest run first.
      .sort((a, b) => nullLast(a.version, b.version)),
    warnings,
    hiddenWarnings: current.length - warnings.length,
    categoryLabels: categoryLabels(list),
  };
}
