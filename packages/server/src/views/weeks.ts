import {
  reporterTotals,
  type FindingsQuery,
  type RunEntry,
  type RunTime,
  type SessionEntry,
  type WeeksResponse,
} from '@cwd/shared';
import type { StoredUnit } from '../db/read.ts';
import { coverageFrom, emptyWeek, median, weekSums } from './home.ts';
import { periodUnits } from './runs.ts';
import type { Scope } from './scope.ts';

/** Full runs with waves and without, as the reporter's run_time: how many, how many have minutes, and their median. */
export function runTime(runs: RunEntry[]): RunTime {
  const full = runs.filter((run) => run.record?.path === 'full');
  const group = (of: RunEntry[]) => {
    const minutes = of.map((run) => run.minutes ?? null);
    return { runs: of.length, timed: minutes.filter((m) => m !== null).length, medianMinutes: median(minutes) };
  };
  return {
    withWaves: group(full.filter((run) => (run.waves?.length ?? 0) > 0)),
    withoutWaves: group(full.filter((run) => !run.waves?.length)),
  };
}

/**
 * The Weeks page: over the stored runs and sessions in the query's period (periodUnits), each of its weeks' sums
 * (weekSums), oldest first, a week with no units empty, and the Full runs' run time; and the reporter's calibration
 * (`totals.usage`) of the period's weeks, newest first, which follows no filter. It holds no project text, so the scope
 * changes only its project filter (period): its sums count every project, as every page's do.
 */
export function weeksView(input: {
  runs: StoredUnit<RunEntry>[];
  sessions: StoredUnit<SessionEntry>[];
  totals: unknown;
  query: FindingsQuery;
  now: Date;
  scope: Scope | null;
}): WeeksResponse {
  const { weeks, runs, sessions } = periodUnits(input.runs, input.sessions, input.query, input.now, input.scope);
  const sums = weekSums(runs, sessions);
  const usage = reporterTotals(input.totals)?.usage ?? [];
  return {
    weeks: weeks.map((week) => ({ week, ...(sums.get(week) ?? emptyWeek()) })),
    runTime: runTime(runs),
    coverageFrom: coverageFrom(input.runs),
    usage: weeks.toReversed().flatMap((week) => usage.filter((row) => row.week === week)),
    usageSource: 'reporter',
  };
}
