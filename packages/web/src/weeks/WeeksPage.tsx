import { useState } from 'react';
import { cn } from 'cn';
import { History } from 'lucide-react';
import type { FindingsQuery, RunTime, UsageWeek, WeeksResponse } from '@cwd/shared';
import { useLiveQuery } from '../api.ts';
import { GroupHead, NUM, Num, SUB, Unknown } from '../components/Num.tsx';
import { ColumnHead, Line, PageTitle, Panel, ScrollTable, Section, State, Term } from '../components/Panel.tsx';
import { ReporterMark } from '../components/ReporterMark.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.tsx';
import { Chart, CoverageNote, singleBars } from '../home/WeeklyCharts.tsx';
import {
  PATH_LABELS,
  countName,
  formatDollars,
  formatUsage,
  formatUsagePercent,
  total,
  usageMark,
  weekLabel,
} from '../lib/format.ts';
import { ListFilters, listPath, useProjects } from '../runs/RunsPage.tsx';

type Week = WeeksResponse['weeks'][number];

const SUBS = [
  ...Object.values(PATH_LABELS),
  ...['critical', 'important', 'minor', 'unneeded'].map(countName),
  'All models',
  'Fable',
  'Not estimated',
];

const RUN_TIMES: { key: keyof RunTime; label: string }[] = [
  { key: 'withWaves', label: 'With waves' },
  { key: 'withoutWaves', label: 'Without waves' },
];

/** The four small multiples, one measure each on its own axis, its unit in its title, the weeks oldest first as the
 * API gives them; the week table is their table view. */
function SmallMultiples({ weeks }: { weeks: Week[] }) {
  const names = weeks.map((w) => w.week);
  const charts = [
    { title: 'Runs', data: weeks.map((w) => total(w.runs)) },
    { title: 'Final review findings', data: weeks.map((w) => total(w.findings)) },
    { title: 'All-models usage (%)', data: weeks.map((w) => w.estimates.all), format: formatUsagePercent },
    // A duration is rounded to whole minutes first.
    {
      title: 'Time per run (min)',
      data: weeks.map((w) => (w.minutesPerRun === null ? null : Math.round(w.minutesPerRun))),
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {charts.map((chart) => (
        <Chart
          key={chart.title}
          title={chart.title}
          option={singleBars(names, chart.title, chart.data, { format: chart.format })}
          height={180}
        />
      ))}
    </div>
  );
}

/** A week's estimate for one limit: its value, after the borrowed marker when the reporter used another week's rates
 * for that limit (`from`, the week it borrowed them from). */
function Estimate({ value, from }: { value: number | null; from: string | null | undefined }) {
  const label = from ? `Rates borrowed from the week of ${weekLabel(from)}` : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {label && (
        <Term tip={label}>
          <History aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="sr-only">{label}</span>
        </Term>
      )}
      <Num value={value} format={formatUsage} />
    </span>
  );
}

/** The week table, newest first for display, one value per cell under its group; a week's estimates are marked where
 * the reporter's calibration (`usage`) says its rates were borrowed. */
function WeeksTable({ weeks, usage }: { weeks: Week[]; usage: UsageWeek[] }) {
  return (
    <Table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': 'By week table' }}>
      <TableHeader>
        <TableRow>
          <TableHead rowSpan={2}>Week</TableHead>
          <GroupHead span={3}>Runs</GroupHead>
          <TableHead rowSpan={2} className={NUM}>
            Tasks
          </TableHead>
          <GroupHead span={4}>Final review findings</GroupHead>
          <TableHead rowSpan={2} className={NUM}>
            Fix rounds
          </TableHead>
          <TableHead rowSpan={2} className={NUM}>
            Stops
          </TableHead>
          <GroupHead span={3}>Est. usage (%)</GroupHead>
          <TableHead rowSpan={2} className={NUM}>
            Time per run (min)
          </TableHead>
          <TableHead rowSpan={2} className={NUM}>
            Later fix commits
          </TableHead>
        </TableRow>
        <TableRow>
          {SUBS.map((column) => (
            <TableHead key={column} className={cn(SUB, NUM)}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {weeks.toReversed().map((w) => {
          // The reporter's calibration of the week, naming the week each limit's rates were borrowed from.
          const rates = usage.find((u) => u.week === w.week);
          return (
            <TableRow key={w.week}>
              <TableHead scope="row">{weekLabel(w.week)}</TableHead>
              {[
                w.runs.small,
                w.runs.full,
                w.runs.plan,
                w.tasks,
                w.findings.critical,
                w.findings.important,
                w.findings.minor,
                w.findings.unneeded,
                w.fixRounds,
                w.stops,
              ].map((value, i) => (
                <TableCell key={i} className={NUM}>
                  <Num value={value} />
                </TableCell>
              ))}
              <TableCell className={NUM}>
                <Estimate value={w.estimates.all} from={rates?.all?.borrowed_from} />
              </TableCell>
              <TableCell className={NUM}>
                <Estimate value={w.estimates.fable} from={rates?.fable?.borrowed_from} />
              </TableCell>
              <TableCell className={NUM}>
                <Num value={w.estimates.notEstimated} />
              </TableCell>
              <TableCell className={NUM}>
                <Num value={w.minutesPerRun} />
              </TableCell>
              <TableCell className={NUM}>
                <Num value={w.laterFixes} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The week a limit's rates were borrowed from; the dash read "not borrowed" for its own, "not known" with no rates. */
function From({ rates }: { rates: { borrowed_from?: string | null } | null | undefined }) {
  if (!rates) return <Unknown />;
  return rates.borrowed_from ? weekLabel(rates.borrowed_from) : <Unknown label="not borrowed" />;
}

/** The reporter's weekly calibration of the period's weeks, newest first as the API gives them: per limit, its points,
 * rates, fit error and the week its rates were borrowed from; account-wide, so the reporter's mark. */
function UsageEstimates({ usage }: { usage: UsageWeek[] }) {
  const dollars = (value: number | null | undefined) => <Num value={value} format={formatDollars} />;
  const points = (value: number | null | undefined) => <Num value={value} format={formatUsage} />;
  const cell = cn('px-2 py-1.5', NUM);
  const group = 'border-b px-2 py-1.5 text-center font-medium';
  return (
    <Panel title="Usage estimates" aside={<ReporterMark mark={usageMark} />}>
      {usage.length === 0 ? (
        <Line muted>No usage estimates in this export.</Line>
      ) : (
        // Every head and cell on one line: a narrow page scrolls the table sideways.
        <ScrollTable label="Usage estimates" className="whitespace-nowrap">
          <thead>
            <tr>
              <ColumnHead rowSpan={2}>Week</ColumnHead>
              <ColumnHead rowSpan={2} num>
                Readings
              </ColumnHead>
              <th scope="colgroup" colSpan={4} className={group}>
                Fable
              </th>
              <th scope="colgroup" colSpan={5} className={group}>
                All models
              </th>
            </tr>
            <tr>
              {['Points', 'Rate ($/pt)', 'Fit error (± pt)'].map((column) => (
                <ColumnHead key={column} num>
                  {column}
                </ColumnHead>
              ))}
              <ColumnHead>From</ColumnHead>
              {['Points', 'Fable rate ($/pt)', 'Other rate ($/pt)', 'Fit error (± pt)'].map((column) => (
                <ColumnHead key={column} num>
                  {column}
                </ColumnHead>
              ))}
              <ColumnHead>From</ColumnHead>
            </tr>
          </thead>
          <tbody>
            {usage.map((u, i) => (
              <tr key={u.week ?? i} className="border-t hover:bg-muted/50">
                <th scope="row" className="px-2 py-1.5 text-left font-medium">
                  {u.week ? weekLabel(u.week) : <Unknown />}
                </th>
                <td className={cell}>
                  <Num value={u.readings} />
                </td>
                <td className={cell}>{points(u.fable?.points)}</td>
                <td className={cell}>{dollars(u.fable?.rate)}</td>
                <td className={cell}>{points(u.fable?.error)}</td>
                <td className="px-2 py-1.5">
                  <From rates={u.fable} />
                </td>
                <td className={cell}>{points(u.all?.points)}</td>
                <td className={cell}>{dollars(u.all?.fable_rate)}</td>
                <td className={cell}>{dollars(u.all?.other_rate)}</td>
                <td className={cell}>{points(u.all?.error)}</td>
                <td className="px-2 py-1.5">
                  <From rates={u.all} />
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
    </Panel>
  );
}

function RunTimeTable({ runTime }: { runTime: RunTime }) {
  return (
    <Table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': 'Full runs, with and without waves table' }}>
      <TableHeader>
        <TableRow>
          <TableHead>Kind</TableHead>
          {['Runs', 'With a run time', 'Median time (min)'].map((column) => (
            <TableHead key={column} className={NUM}>
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {RUN_TIMES.map(({ key, label }) => (
          <TableRow key={key}>
            <TableHead scope="row">{label}</TableHead>
            <TableCell className={NUM}>
              <Num value={runTime[key].runs} />
            </TableCell>
            <TableCell className={NUM}>
              <Num value={runTime[key].timed} />
            </TableCell>
            <TableCell className={NUM}>
              <Num value={runTime[key].medianMinutes} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The Weeks page: the period's four small multiples, its weeks newest first, the reporter's usage estimates of those
 * weeks, and its Full runs' run time, with and without waves.
 */
export function WeeksPage() {
  const [query, setQuery] = useState<FindingsQuery>({ weeks: 12 });
  const weeks = useLiveQuery<WeeksResponse>(listPath('/api/weeks', query));
  const projects = useProjects();
  const data = weeks.data;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Weeks</PageTitle>
      <ListFilters query={query} projects={projects} onChange={(change) => setQuery({ ...query, ...change })} />
      {weeks.isPending && <State>Loading the weeks…</State>}
      {weeks.isError && <State error>Couldn't load the weeks.</State>}
      {data && (
        <>
          <SmallMultiples weeks={data.weeks} />
          {data.weeks.every((w) => total(w.runs) === 0) && (
            <Line>No runs in this period. A week fills once a run that finished in it is imported.</Line>
          )}
          <CoverageNote coverageFrom={data.coverageFrom} firstWeek={data.weeks[0].week} />
          <Section title="By week">
            <WeeksTable weeks={data.weeks} usage={data.usage} />
          </Section>
          <UsageEstimates usage={data.usage} />
          <Section title="Full runs, with and without waves">
            <RunTimeTable runTime={data.runTime} />
          </Section>
        </>
      )}
    </div>
  );
}
