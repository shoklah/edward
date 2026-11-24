import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { loadReport, type KitsResponse, type ReviewSums } from '@cwd/shared';
import { fixture } from '../../shared/test/fixture.ts';
import { createApp } from '../src/app.ts';
import { openDb, type Db } from '../src/db/open.ts';
import { importReport } from '../src/db/import.ts';
import { listUnits, setSeenAt, setShowing } from '../src/db/read.ts';
import { projectKey } from '../src/keys.ts';
import { dispatchCost } from '../src/views/kits.ts';
import { storedBranches, storedSessionRoots } from '../src/views/runs.ts';
import { forbiddenStrings, leaks } from '../src/views/scope.ts';
import { stepSums } from '../src/views/steps.ts';

const PORT = 4317;
const NOW = new Date('2026-11-12T12:00:00Z');
const KEYS: string[] = fixture('report-kits').runs.map((run: any) => run.key);
// The fixture's runs, by their place in it.
const [TAG_WRAP, EMPTY_PAYLOAD, EVENT_LOG, SYNC_LOG] = [0, 1, 2, 3];
const LANTERN = '/Users/example/Work/lantern-notes';
const TIDEPOOL = '/Users/example/Work/tidepool-api';

let dir: string;
let files: number;
let db: Db;

/** Imports the named fixture, changed first by `change`, into `db`. */
function store(change: (raw: any) => unknown = () => {}, name = 'report-kits'): void {
  const raw = fixture(name);
  change(raw);
  const loaded = loadReport(JSON.parse(JSON.stringify(raw)));
  if (!loaded.ok) throw new Error(`${name} does not load`);
  importReport(db, loaded.report, { runs: raw.runs, sessions: raw.sessions, totals: raw.totals }, NOW);
}

/** `store`, into a fresh file. */
function load(change?: (raw: any) => unknown, name?: string): void {
  db?.$client.close();
  db = openDb(join(dir, String(files++), 'dashboard.sqlite'));
  store(change, name);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cwd kits '));
  files = 0;
  load();
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

async function kits(query = ''): Promise<KitsResponse> {
  const app = createApp({
    db,
    port: PORT,
    requestImport: () => {},
    importing: () => false,
    webDist: null,
    now: () => NOW,
    aliases: {},
    labeller: null,
  });
  const res = await app.request(`/api/kits${query}`, { headers: { Host: `localhost:${PORT}` } });
  expect(res.status).toBe(200);
  return res.json();
}

const cents = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Ran, found nothing, critical, important and minor as found/acted on, not valid, re-checks, cost. */
const row = (r: ReviewSums) => [
  r.ran, r.foundNothing, ...[r.critical, r.important, r.minor].map((f) => `${f.found}/${f.actedOn}`), r.invalid, r.rechecks, cents(r.cost),
];
/** Project, path, runs, tasks, the row, share. */
const where = (body: KitsResponse) =>
  body.projects.flatMap((p) => p.paths.map((x) => [p.project, x.path, x.runs, x.tasks, ...row(x), cents(x.share)]));

test("the kit's review beside the task and final reviews of the same runs", async () => {
  const body = await kits();
  expect([body.kits, body.kit]).toEqual([['prose', 'ui'], 'ui']);
  expect(body.reviews.map((r) => [r.step, ...row(r)])).toEqual([
    ['kit_review', 6, 2, '0/0', '3/2', '4/0', 1, 2, 3.05],
    ['task_review', 5, 3, '0/0', '1/1', '2/1', 0, 2, 4.5],
    ['final_review', 4, 2, '0/0', '1/1', '2/1', 0, 2, 4],
  ]);
  expect((await kits('?kit=prose')).reviews.map((r) => [r.step, ...row(r)])).toEqual([
    ['kit_review', 1, 0, '0/0', '0/0', '1/0', 0, 0, 0.35],
    ['task_review', 2, 1, '0/0', '0/0', '1/1', 0, 1, 1.5],
    ['final_review', 1, 1, '0/0', '0/0', '0/0', 0, 0, 0.9],
  ]);
});

test('checklist lines, most findings first, the findings with no label in one row', async () => {
  const { lines } = await kits();
  expect(lines.map((l) => [l.label, l.critical, l.important, l.minor, l.total, l.actedOn, l.deferred, l.toOwner, l.open, l.noAction, l.invalid])).toEqual([
    ['Every width', 0, 2, 1, 3, 2, 0, 1, 0, 0, 0],
    ['States', 0, 1, 1, 2, 0, 1, 0, 1, 0, 0],
    ['Reading order', 0, 0, 1, 1, 0, 0, 0, 1, 0, 0],
    [null, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
  ]);
});

test('a critical finding counts as its own severity in each section', async () => {
  load((raw) => (raw.runs[SYNC_LOG].steps[1].findings[0].severity = 'critical'));
  const { reviews, lines, projects, versions } = await kits();
  expect([reviews[0], projects[0].paths[0], versions[0]].map((r) => row(r).slice(2, 5))).toEqual([
    ['1/1', '2/1', '4/0'],
    ['1/1', '0/0', '3/0'],
    ['1/1', '1/0', '3/0'],
  ]);
  expect(lines[0]).toMatchObject({ label: 'Every width', critical: 1, important: 1, minor: 1, total: 3 });
});

test('where it ran: by project and path, a cost with no price and a Small run’s tasks unknown', async () => {
  expect(where(await kits())).toEqual([
    ['lantern-notes', 'full', 1, 3, 3, 1, '0/0', '1/1', '3/0', 1, 1, 2.1, 15],
    ['lantern-notes', 'small', 1, null, 1, 0, '0/0', '1/1', '1/0', 0, 1, 0.55, 18.33],
    ['tidepool-api', 'full', 1, 1, 1, 0, '0/0', '1/0', '0/0', 0, 0, 0.4, 5],
    ['tidepool-api', 'small', 1, null, 1, 1, '0/0', '0/0', '0/0', 0, 0, null, null],
  ]);
});

test('where it ran: most runs first; a share counts only runs with a known cost; a forgotten record has no tasks', async () => {
  load((raw) => {
    raw.runs[SYNC_LOG].kits = [];
    raw.runs[SYNC_LOG].models = null;
    raw.runs[TAG_WRAP].record.project = TIDEPOOL;
  });
  expect(where(await kits()).map((r) => [...r.slice(0, 4), ...r.slice(-2)])).toEqual([
    ['tidepool-api', 'full', 1, 1, 0.4, 5],
    ['tidepool-api', 'small', 2, null, 0.55, 18.33],
    ['lantern-notes', 'full', 1, null, 2.1, null],
  ]);
});

test('by version, newest run first, the version a record forgot last, with the last check results', async () => {
  const { versions } = await kits();
  expect(versions.map((v) => [v.version, v.runs, ...row(v), v.checks.passed, v.checks.failed, v.checks.couldntRun])).toEqual([
    ['0.2.0', 2, 4, 1, '0/0', '2/1', '3/0', 1, 1, 2.5, 2, 1, 1],
    ['0.1.0', 1, 1, 0, '0/0', '1/1', '1/0', 0, 1, 0.55, 1, 0, 0],
    [null, 1, 1, 1, '0/0', '0/0', '0/0', 0, 0, null, 0, 0, 0],
  ]);
});

test("the current kit warnings of the kit's runs, newest run first", async () => {
  setSeenAt(db, new Date(0));
  const { warnings } = await kits();
  expect(warnings.map((w) => [w.runKey, w.kind])).toEqual([
    [KEYS[SYNC_LOG], 'kit_unverified'],
    [KEYS[SYNC_LOG], 'kit_unverified'],
    [KEYS[EVENT_LOG], 'kit_check_missing'],
    [KEYS[EVENT_LOG], 'kit_review_missing'],
    [KEYS[EMPTY_PAYLOAD], 'kit_unrecorded'],
  ]);
  expect(warnings[0]).toEqual({
    kind: 'kit_unverified', text: "WARN: feature/sync-log (2026-11-04): kit ui's checks ended couldnt_run on task 3", sessionId: null, isNew: true,
    runKey: KEYS[SYNC_LOG], project: 'lantern-notes', branch: 'feature/sync-log', headline: 'Show what each sync did',
  });
  expect((await kits('?kit=prose')).warnings.map((w) => w.kind)).toEqual(['kit_check_missing', 'kit_review_missing']);
  // A later export drops sync-log's second kit warning, now resolved, and adds one of another family: neither is listed.
  store((raw) => {
    const run = raw.runs[SYNC_LOG];
    const other = { ...run.warnings[1], kind: 'step_agent_missing', text: 'WARN: feature/sync-log (2026-11-04): final_review step 9 has no agent id' };
    run.warnings = [run.warnings[0], other];
    run.warns = run.warnings.map((w: any) => w.text);
  });
  expect((await kits()).warnings.filter((w) => w.runKey === KEYS[SYNC_LOG]).map((w) => w.text)).toEqual([
    "WARN: feature/sync-log (2026-11-04): kit ui's checks ended failed on task 2",
  ]);
});

test("the kit's findings, newest run first, each with its run and its line", async () => {
  const { findings } = await kits();
  expect(findings.map((f) => [f.runKey, f.id, f.label])).toEqual([
    [KEYS[SYNC_LOG], 'F3', 'Every width'],
    [KEYS[SYNC_LOG], 'F4', 'States'],
    [KEYS[SYNC_LOG], 'F5', 'Every width'],
    [KEYS[SYNC_LOG], 'F6', null],
    [KEYS[EVENT_LOG], 'F3', 'States'],
    [KEYS[TAG_WRAP], 'F2', 'Every width'],
    [KEYS[TAG_WRAP], 'F3', 'Reading order'],
  ]);
  expect(findings[0]).toMatchObject({ project: 'lantern-notes', branch: 'feature/sync-log', headline: 'Show what each sync did', step: 'kit_review', task: 1 });
});

test('the Kit filter opens on the kit with the most runs, the first by name on a tie or with none; an unknown name is the default', async () => {
  // One run each on tidepool-api's Full path.
  expect((await kits(`?path=full&project=${projectKey(TIDEPOOL)}`)).kit).toBe('prose');
  expect(await kits('?weeks=1')).toMatchObject({ kit: 'prose', reviews: [], projects: [], lines: [], versions: [], warnings: [], findings: [] });
  expect(await kits('?kit=none')).toEqual(await kits());
  expect(await kits('?path=plan&kit=ui')).toMatchObject({ kit: 'ui', projects: [] });
  expect(where(await kits(`?project=${projectKey(LANTERN)}`)).map((r) => r[0])).toEqual(['lantern-notes', 'lantern-notes']);
});

test('a plan record that names a kit does not count, and with no kit there is none to show', async () => {
  load((raw) => (raw.runs[SYNC_LOG].record.path = 'plan'));
  expect(where(await kits()).map((r) => r.slice(0, 2))).toEqual([['tidepool-api', 'full'], ['tidepool-api', 'small'], ['lantern-notes', 'small']]);
  load(() => {}, 'report-v7');
  expect(await kits()).toMatchObject({ kits: [], kit: null, projects: [], lines: [], versions: [] });
});

test("each dispatch counts in one cost: a kit-reviewer's with no kind in its kit's, a pair's second half in none, an untied one of two kits in none", async () => {
  load((raw) =>
    raw.runs[SYNC_LOG].dispatches.push(
      { kind: 'final_review', agent: 'final-reviewer', step: 9, pair: true, models: { a: { cost: 7 } } },
      { kind: null, agent: 'kit-reviewer', step: null, models: { a: { cost: 0.05 } } },
    ),
  );
  expect((await kits()).reviews.map((r) => cents(r.cost))).toEqual([3.1, 4.5, 4]);
  const runs = listUnits(db, 'run').map((unit) => unit.merged);
  const reviews = (kit: string | null) =>
    runs.reduce((sum, run) => sum + (dispatchCost(run, (d, k) => d.kind === 'kit_review' && k === kit) ?? 0), 0);
  expect(['ui', 'prose', null].map((kit) => cents(reviews(kit)))).toEqual([2.75, 0.35, 0.25]);
  // Together they are the Steps page's row.
  expect(cents(reviews('ui') + reviews('prose') + reviews(null))).toBe(cents(stepSums(runs).find((r) => r.step === 'kit_review')!.cost));
});

test('with showing on, sums count every project, names mask before summing, the lists are the shown project’s, and nothing leaks', async () => {
  load((raw) => {
    const run = raw.runs[SYNC_LOG];
    run.kits[0] = { ...run.kits[0], name: 'tidepool-api', version: 'tidepool-api' };
    for (const check of run.kit_checks) check.kit = 'tidepool-api';
    for (const step of run.steps) if (step.kit) step.kit = 'TIDEPOOL-API';
    Object.assign(run.steps[1].findings[0], { label: 'As tidepool-api does', summary: 'As tidepool-api does on feature/event-log' });
    run.warns[0] = run.warns[0].replace('kit ui', 'kit tidepool-api');
    run.warnings[0].text = run.warns[0];
  });
  expect((await kits('?kit=tidepool-api')).kit).toBe('tidepool-api');
  setShowing(db, [projectKey(LANTERN)]);
  const body = await kits();
  expect([body.kits, body.kit]).toEqual([['another project', 'prose', 'ui'], 'ui']);
  expect(where(body).map((r) => r.slice(0, 3))).toEqual([['lantern-notes', 'small', 1], [null, 'full', 1], [null, 'small', 1]]);
  expect([body.findings.length, body.hiddenFindings, body.warnings.length, body.hiddenWarnings]).toEqual([2, 1, 0, 3]);
  // A guessed hidden name matches nothing; the masked one, space and all, is the filter's value.
  expect((await kits('?kit=tidepool-api')).kit).toBe('ui');
  const masked = await kits('?kit=another+project');
  expect(masked.kit).toBe('another project');
  expect(masked.versions.map((v) => [v.version, v.ran, v.checks.passed])).toEqual([['another project', 3, 1]]);
  expect(masked.lines.map((l) => l.label)).toContain('As another project does');
  expect(masked.warnings[0].text).toBe("WARN: feature/sync-log (2026-11-04): kit another project's checks ended failed on task 2");
  const branches = storedBranches(listUnits(db, 'run'));
  const strings = forbiddenStrings([...branches.keys()], branches, [LANTERN], [], storedSessionRoots(listUnits(db, 'session')));
  expect(strings.forbidden).toEqual(expect.arrayContaining(['tidepool-api', 'feature/event-log']));
  for (const response of [body, masked]) expect(leaks(response, [...strings.forbidden, '/Users/example'], strings.shown)).toEqual([]);
});
