import type { Found, KitFinding, KitLine, KitPath, KitsResponse, KitVersion, KitWarning, Outcome, ReviewSums } from '@cwd/shared';
import { categoryLabels, finding } from './runs.ts';

// Invented answers of GET /api/kits for the Kits page's stories: a ui kit over two projects, two paths and two versions.

const found = (count: number, actedOn: number): Found => ({ found: count, actedOn });

/** A kind of review's sums: `ran` and `foundNothing`, its critical, important and minor findings as found and acted on,
 * those not valid, its re-checks and its cost. */
const sums = (
  [ran, foundNothing]: [number, number],
  [critical, important, minor]: [Found, Found, Found],
  [invalid, rechecks, cost]: [number, number, number],
): ReviewSums => ({ ran, foundNothing, critical, important, minor, invalid, rechecks, cost });

const path = (
  name: KitPath['path'],
  runs: number,
  tasks: number | null,
  share: number,
  reviews: ReviewSums,
): KitPath => ({ path: name, runs, tasks, share, ...reviews });

const version = (name: string, runs: number, reviews: ReviewSums, checks: KitVersion['checks']): KitVersion => ({
  version: name,
  runs,
  checks,
  ...reviews,
});

const line = (
  label: string,
  [critical, important, minor, total]: [number, number, number, number],
  [actedOn, deferred, toOwner, open, noAction]: [number, number, number, number, number],
  invalid: number,
): KitLine => ({ label, critical, important, minor, total, actedOn, deferred, toOwner, open, noAction, invalid });

const OFFLINE = {
  runKey: 'd4e5f60718293041',
  project: 'lantern-notes',
  branch: 'feat/offline-sync',
  headline: 'Offline notes sync when the device reconnects',
};
const CONFLICTS = {
  runKey: 'e5f6071829304152',
  project: 'lantern-notes',
  branch: 'feat/conflict-dialog',
  headline: 'Conflicts can be settled one note at a time',
};
const NOTEBOOKS = {
  runKey: 'f607182930415263',
  project: 'lantern-notes',
  branch: 'feat/notebook-times',
  headline: 'Notebooks show when they last synced',
};
const SHARING = {
  runKey: '0718293041526374',
  project: 'lantern-notes',
  branch: 'feat/share-link',
  headline: 'Notes can be shared by link',
};
const WEBHOOKS = {
  runKey: '1829304152637485',
  project: 'tidepool-api',
  branch: 'fix/webhook-backoff',
  headline: 'Webhooks retry with backoff',
};

/** A kit review's finding of "Every width". */
const item = (
  run: Pick<KitFinding, 'runKey' | 'project' | 'branch' | 'headline'>,
  id: string,
  severity: string,
  outcome: Outcome,
  summary: string,
): KitFinding => ({
  ...finding({
    id,
    step: 'kit_review',
    severity,
    outcome,
    summary,
    category: 'kit',
    judge: 'workflow',
    validity: 'valid',
    label: 'Every width',
  }),
  ...run,
});

const FINDINGS: KitFinding[] = [
  item(OFFLINE, 'F3', 'critical', 'fixed', 'The sync log table scrolls the whole page sideways at 375 px instead of its own region.'),
  item(CONFLICTS, 'F9', 'critical', 'fixed', 'The conflict dialog is wider than a phone, so its Keep mine button is cut off.'),
  item(OFFLINE, 'F4', 'important', 'fixed', 'At 768 px the filter row wraps to three lines and pushes the list below the fold.'),
  item(NOTEBOOKS, 'F7', 'important', 'fixed', 'A long notebook name runs under the sync time instead of wrapping.'),
  item(NOTEBOOKS, 'F2', 'important', 'to_owner', 'The notebook list loses its last column at 768 px with no scroll cue.'),
  item(SHARING, 'F5', 'important', 'deferred', 'The share sheet opens off screen on a phone held sideways.'),
  item(CONFLICTS, 'F6', 'minor', 'to_owner', 'The sync banner covers the search field at 375 px.'),
  item(CONFLICTS, 'F11', 'minor', 'deferred', 'Two buttons overlap when the conflict count has three digits.'),
  item(SHARING, 'F12', 'minor', 'to_owner', 'The tag row is cut instead of wrapping at 768 px.'),
  item(OFFLINE, 'F13', 'minor', 'deferred', 'The empty state sits left of the column it fills at 1440 px.'),
  item(NOTEBOOKS, 'F10', 'minor', 'to_owner', 'The header row keeps its desktop padding on a phone.'),
  item(SHARING, 'F8', 'minor', 'declined', 'The link field could take the full width at 1440 px.'),
];

const warning = (
  w: Pick<KitWarning, 'kind' | 'text' | 'isNew'>,
  run: Pick<KitWarning, 'runKey' | 'project' | 'branch' | 'headline'>,
): KitWarning => ({ sessionId: null, ...w, ...run });

/** The ui kit's period: its reviews beside the others, three checklist lines, two projects, two versions, two warnings
 * and the 12 findings of "Every width". */
export const kitsFull: KitsResponse = {
  kits: ['prose', 'ui'],
  kit: 'ui',
  reviews: [
    { step: 'kit_review', ...sums([41, 14], [found(2, 2), found(12, 7), found(46, 13)], [2, 10, 36.4]) },
    { step: 'task_review', ...sums([52, 6], [found(1, 1), found(38, 37), found(121, 41)], [3, 24, 88.12]) },
    { step: 'final_review', ...sums([23, 2], [found(0, 0), found(27, 25), found(74, 33)], [1, 15, 71.9]) },
  ],
  lines: [
    line('Matches the design', [0, 2, 15, 17], [5, 8, 1, 0, 3], 1),
    line('Every width', [2, 4, 6, 12], [4, 3, 4, 0, 1], 0),
    line('Reading order', [0, 0, 2, 2], [0, 1, 1, 0, 0], 0),
  ],
  findings: FINDINGS,
  hiddenFindings: 0,
  projects: [
    {
      project: 'lantern-notes',
      paths: [
        path('full', 7, 22, 11, sums([22, 6], [found(2, 2), found(5, 4), found(24, 8)], [1, 6, 19.3])),
        path('small', 6, null, 18, sums([6, 2], [found(0, 0), found(4, 1), found(8, 2)], [1, 2, 6.85])),
      ],
    },
    {
      project: 'tidepool-api',
      paths: [
        path('full', 3, 9, 6, sums([9, 4], [found(0, 0), found(2, 2), found(11, 2)], [0, 2, 7.94])),
        path('small', 2, null, 10, sums([4, 2], [found(0, 0), found(1, 0), found(3, 1)], [0, 0, 2.31])),
      ],
    },
  ],
  versions: [
    version(
      '0.2.0',
      12,
      sums([27, 11], [found(2, 2), found(5, 3), found(23, 7)], [1, 6, 24.1]),
      { passed: 27, failed: 0, couldntRun: 1 },
    ),
    version(
      '0.1.0',
      6,
      sums([14, 3], [found(0, 0), found(7, 4), found(23, 6)], [1, 4, 12.3]),
      { passed: 14, failed: 1, couldntRun: 1 },
    ),
  ],
  warnings: [
    warning(
      {
        kind: 'kit_unverified',
        text: "WARN: feat/offline-sync (2026-11-10): kit ui: the last check of task 3 couldn't run",
        isNew: true,
      },
      OFFLINE,
    ),
    warning(
      { kind: 'kit_review_missing', text: 'WARN: fix/webhook-backoff (2026-11-04): kit ui: task 2 has no kit review', isNew: false },
      WEBHOOKS,
    ),
  ],
  hiddenWarnings: 0,
  categoryLabels,
};

/** No kit in any stored run. */
export const kitsNone: KitsResponse = {
  kits: [],
  kit: null,
  reviews: [],
  lines: [],
  findings: [],
  hiddenFindings: 0,
  projects: [],
  versions: [],
  warnings: [],
  hiddenWarnings: 0,
  categoryLabels,
};

/** The ui kit ran in none of the period's runs. */
export const kitsIdle: KitsResponse = { ...kitsNone, kits: ['prose', 'ui'], kit: 'ui' };

/** Showing mode on: the hidden project's runs one last item, its findings and both warnings only counted. */
export const kitsShowing: KitsResponse = {
  ...kitsFull,
  projects: [kitsFull.projects[0], { ...kitsFull.projects[1], project: null }],
  warnings: [],
  hiddenFindings: 5,
  hiddenWarnings: 2,
};
