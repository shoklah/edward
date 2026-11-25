import type { ComplianceWarning } from './compliance.ts';
import type { FindingItem, FindingsQuery } from './findings.ts';

/** `GET /api/kits`'s query: the period's, plus `kit`, a kit's name as the response's `kits` lists it. */
export type KitsQuery = FindingsQuery & { kit?: string };
/** Findings, and those of them acted on (OUTCOME_GROUPS). */
export type Found = { found: number; actedOn: number };
/** A kind of review over runs: its steps, those whose counts are all zero, its findings by severity (the ruled one,
 * `unneeded` left out), those three severities' findings judged invalid, its re-checks, and its cost with theirs. */
export type ReviewSums = {
  ran: number;
  foundNothing: number;
  critical: Found;
  important: Found;
  minor: Found;
  invalid: number;
  rechecks: number;
  cost: number | null;
};
/** A checklist line's findings; null is the row of findings with no label. The five endings add up to `total`. */
export type KitLine = {
  label: string | null;
  critical: number;
  important: number;
  minor: number;
  total: number;
  actedOn: number;
  deferred: number;
  toOwner: number;
  open: number;
  noAction: number;
  invalid: number;
};
/** A project's runs of one path: `tasks` null when not known, `share` the kit's percent of the runs' cost. */
export type KitPath = ReviewSums & { path: 'full' | 'small'; runs: number; tasks: number | null; share: number | null };
/** A version's runs (null: not known), with the kit's last check results. */
export type KitVersion = ReviewSums & {
  version: string | null;
  runs: number;
  checks: { passed: number; failed: number; couldntRun: number };
};
export type KitFinding = Omit<FindingItem, 'week' | 'area'>;
export type KitWarning = Omit<ComplianceWarning, 'family' | 'week' | 'step'>;
/** `GET /api/kits`: every kit's name; the kit shown (null with none); then that kit's sections, empty when it ran in
 * none of the period's runs. A null `project` is showing mode's hidden projects together, last. `hiddenFindings` and
 * `hiddenWarnings` count what showing mode left out of the two lists. */
export type KitsResponse = {
  kits: string[];
  kit: string | null;
  reviews: (ReviewSums & { step: 'kit_review' | 'task_review' | 'final_review' })[];
  lines: KitLine[];
  findings: KitFinding[];
  hiddenFindings: number;
  projects: { project: string | null; paths: KitPath[] }[];
  versions: KitVersion[];
  warnings: KitWarning[];
  hiddenWarnings: number;
  categoryLabels: Record<string, string>;
};
