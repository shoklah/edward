import { useState, type ReactNode } from 'react';
import { cn } from 'cn';
import type { KitLine, KitsQuery, KitsResponse, KitWarning } from '@cwd/shared';
import { useLiveQuery } from '../api.ts';
import { PROJECT_COLUMN, RUN_COLUMN, SEEN_COLUMN, WARNING_COLUMN } from '../compliance/CompliancePage.tsx';
import { DataList, type ListColumn, type ListFact } from '../components/DataList.tsx';
import { EmptyRow, GroupHead, Lines, NUM, Num, Text } from '../components/Num.tsx';
import { LINK, Line, PageTitle, Section, State } from '../components/Panel.tsx';
import { ShareBar } from '../components/ShareBar.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.tsx';
import { STEP_LABELS, formatCompactFixed, formatDollars, hiddenLabel, kindLabel, pathLabel, plural } from '../lib/format.ts';
import { FindingsTable } from '../runs/FindingsTable.tsx';
import { ListFilters, listPath, useProjects } from '../runs/RunsPage.tsx';
import { FoundCells, FoundHeads, SubHeads, together } from './FoundPair.tsx';

/** A section's table, which scrolls in its own region, "<title> table". */
function KitTable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <Table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': `${title} table` }}>{children}</Table>
    </Section>
  );
}

/** Column headers beside the groups, over both header rows, numeric unless `text`. */
function Heads({ columns, text = false }: { columns: string[]; text?: boolean }) {
  return columns.map((column) => (
    <TableHead key={column} rowSpan={2} className={cn(!text && NUM)}>
      {column}
    </TableHead>
  ));
}

function NumCell({ value, format }: { value: number | null; format?: (n: number) => string }) {
  return (
    <TableCell className={NUM}>
      <Num value={value} format={format} />
    </TableCell>
  );
}

/** The kit's reviews beside the task and final reviews of the same runs. */
function ReviewsTable({ reviews }: { reviews: KitsResponse['reviews'] }) {
  return (
    <KitTable title="Reviews in the kit's runs">
      <TableHeader>
        <TableRow>
          <Heads columns={['Review']} text />
          <Heads columns={['Ran', 'Found nothing']} />
          <GroupHead span={2}>Critical</GroupHead>
          <GroupHead span={2}>Important</GroupHead>
          <GroupHead span={2}>Minor</GroupHead>
          <Heads columns={['Not valid', 'Re-checks', 'Est. cost ($)']} />
        </TableRow>
        <TableRow>
          <FoundHeads />
          <FoundHeads />
          <FoundHeads />
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((r) => (
          <TableRow key={r.step}>
            <TableHead scope="row">{STEP_LABELS[r.step]}</TableHead>
            <NumCell value={r.ran} />
            <NumCell value={r.foundNothing} />
            <FoundCells value={r.critical} />
            <FoundCells value={r.important} />
            <FoundCells value={r.minor} />
            <NumCell value={r.invalid} />
            <NumCell value={r.rechecks} />
            <NumCell value={r.cost} format={formatDollars} />
          </TableRow>
        ))}
      </TableBody>
    </KitTable>
  );
}

const FOUND = ['Critical', 'Important', 'Minor', 'Total'];
const ENDED = ['Acted on', 'Deferred', 'To owner', 'Open', 'No action'];
const LINE_COLUMN_COUNT = 12;

/** The kit's checklist lines, their findings by severity and by how they ended; a line's name is a button that chooses
 * it, or with the chosen one, none. */
function LinesTable({
  lines,
  chosen,
  onChoose,
}: {
  lines: KitLine[];
  chosen: KitLine | undefined;
  onChoose: (line: KitLine | null) => void;
}) {
  return (
    <KitTable title="Checklist lines">
      <TableHeader>
        <TableRow>
          <Heads columns={['Line']} text />
          <GroupHead span={FOUND.length}>Found</GroupHead>
          <GroupHead span={ENDED.length}>How they ended</GroupHead>
          <Heads columns={['Share acted on']} text />
          <Heads columns={['Not valid']} />
        </TableRow>
        <TableRow>
          <SubHeads columns={FOUND} />
          <SubHeads columns={ENDED} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.length === 0 && <EmptyRow columns={LINE_COLUMN_COUNT}>No findings</EmptyRow>}
        {lines.map((line) => {
          const pressed = line === chosen;
          return (
            <TableRow key={line.label} data-state={pressed ? 'selected' : undefined}>
              <TableHead scope="row">
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onChoose(pressed ? null : line)}
                  className={cn('rounded-sm', LINK)}
                >
                  <Text value={line.label} unknown="no line" />
                </button>
              </TableHead>
              <NumCell value={line.critical} />
              <NumCell value={line.important} />
              <NumCell value={line.minor} />
              <NumCell value={line.total} />
              <NumCell value={line.actedOn} />
              <NumCell value={line.deferred} />
              <NumCell value={line.toOwner} />
              <NumCell value={line.open} />
              <NumCell value={line.noAction} />
              <TableCell>
                <ShareBar share={(100 * line.actedOn) / line.total} />
              </TableCell>
              <NumCell value={line.invalid} />
            </TableRow>
          );
        })}
      </TableBody>
    </KitTable>
  );
}

/** Where the kit ran: a project's paths under its name, showing mode's hidden projects one last item. */
function WhereTable({ projects }: { projects: KitsResponse['projects'] }) {
  return (
    <KitTable title="Where it ran">
      <TableHeader>
        <TableRow>
          <Heads columns={['Project', 'Path']} text />
          <Heads columns={['Runs', 'Tasks', 'Reviews', 'Found nothing']} />
          <GroupHead span={2}>Critical and important</GroupHead>
          <GroupHead span={2}>Minor</GroupHead>
          <Heads columns={['Re-checks', 'Est. cost ($)', 'Share of run cost (%)']} />
        </TableRow>
        <TableRow>
          <FoundHeads />
          <FoundHeads />
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map(({ project, paths }, i) => (
          <Lines
            key={i}
            name={project ?? 'Other projects'}
            lines={paths.length}
            line={(j) => {
              const p = paths[j];
              return (
                <>
                  <TableCell>{pathLabel(p.path)}</TableCell>
                  <NumCell value={p.runs} />
                  <NumCell value={p.tasks} />
                  <NumCell value={p.ran} />
                  <NumCell value={p.foundNothing} />
                  <FoundCells value={together(p.critical, p.important)} />
                  <FoundCells value={p.minor} />
                  <NumCell value={p.rechecks} />
                  <NumCell value={p.cost} format={formatDollars} />
                  <NumCell value={p.share} />
                </>
              );
            }}
          />
        ))}
      </TableBody>
    </KitTable>
  );
}

const CHECKS = ['Passed', 'Failed', "Couldn't run"];

/** The kit's versions, newest first, with their last check results. */
function VersionsTable({ versions }: { versions: KitsResponse['versions'] }) {
  return (
    <KitTable title="By version">
      <TableHeader>
        <TableRow>
          <Heads columns={['Version']} text />
          <Heads columns={['Runs', 'Reviews', 'Found nothing', 'Findings per review']} />
          <GroupHead span={2}>Critical and important</GroupHead>
          <GroupHead span={2}>Minor</GroupHead>
          <GroupHead span={CHECKS.length}>Checks, last result</GroupHead>
        </TableRow>
        <TableRow>
          <FoundHeads />
          <FoundHeads />
          <SubHeads columns={CHECKS} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => {
          const serious = together(v.critical, v.important);
          return (
            <TableRow key={v.version}>
              <TableHead scope="row">
                <Text value={v.version} />
              </TableHead>
              <NumCell value={v.runs} />
              <NumCell value={v.ran} />
              <NumCell value={v.foundNothing} />
              <NumCell value={v.ran ? together(serious, v.minor).found / v.ran : null} format={formatCompactFixed} />
              <FoundCells value={serious} />
              <FoundCells value={v.minor} />
              <NumCell value={v.checks.passed} />
              <NumCell value={v.checks.failed} />
              <NumCell value={v.checks.couldntRun} />
            </TableRow>
          );
        })}
      </TableBody>
    </KitTable>
  );
}

const WARNING_COLUMNS: ListColumn<KitWarning>[] = [
  {
    id: 'kind',
    header: 'Kind',
    names: true,
    value: (w) => kindLabel(w.kind),
    text: (w) => kindLabel(w.kind),
    cell: (w) => kindLabel(w.kind),
  },
  { ...RUN_COLUMN, names: false, wide: true },
  PROJECT_COLUMN,
  SEEN_COLUMN,
];
const WARNING_FACTS: ListFact<KitWarning>[] = [['Warning', WARNING_COLUMN.cell]];

/** A kit's sections over the period: its reviews, its checklist lines, where it ran, its versions and its warnings; the
 * chosen line's findings under the lines, and under each list what showing mode left out of it. */
function KitSections({
  response,
  chosen,
  onChoose,
}: {
  response: KitsResponse;
  chosen: KitLine | undefined;
  onChoose: (line: KitLine | null) => void;
}) {
  const { hiddenFindings, hiddenWarnings } = response;
  const listed = chosen ? response.findings.filter((f) => f.label === chosen.label) : [];
  return (
    <>
      <ReviewsTable reviews={response.reviews} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-6">
          <LinesTable lines={response.lines} chosen={chosen} onChoose={onChoose} />
          {chosen && (
            <FindingsTable
              key={`${response.kit} ${chosen.label}`}
              findings={listed}
              categoryLabels={response.categoryLabels}
              run
              skip={['step']}
              heading={
                chosen.label === null
                  ? `${plural(listed.length, 'finding')} with no line`
                  : `${plural(listed.length, 'finding')} of "${chosen.label}"`
              }
            />
          )}
        </div>
        {hiddenFindings > 0 && <Line>{hiddenLabel(hiddenFindings, 'finding')}</Line>}
      </div>
      <WhereTable projects={response.projects} />
      <VersionsTable versions={response.versions} />
      <Section title="Warnings">
        <DataList
          rows={response.warnings}
          rowKey={(w) => `${w.runKey} ${w.text}`}
          name={(w) => kindLabel(w.kind)}
          columns={WARNING_COLUMNS}
          facts={WARNING_FACTS}
          label="Warnings table"
          empty={hiddenWarnings > 0 ? undefined : 'No kit warnings in these runs.'}
        />
        {hiddenWarnings > 0 && <Line>{hiddenLabel(hiddenWarnings, 'warning')}</Line>}
      </Section>
    </>
  );
}

/**
 * The Kits page: one kit at a time, over the period's runs that use it, the Kit filter's or the one the server picks:
 * what its reviews found beside the others, each checklist line's findings, listed for a chosen line, where it ran, its
 * versions and its warnings.
 */
export function KitsPage() {
  const [query, setQuery] = useState<KitsQuery>({ weeks: 4 });
  const [line, setLine] = useState<Pick<KitLine, 'label'> | null>(null);
  const kits = useLiveQuery<KitsResponse>(listPath('/api/kits', query));
  // The Kit filter's names, from a query of their own, so the filter stays when a pick fails.
  const options = useLiveQuery<KitsResponse>(listPath('/api/kits', { weeks: 4 })).data;
  const projects = useProjects();
  const data = kits.data;
  const set = (change: Partial<KitsQuery>) => {
    setQuery({ ...query, ...change });
    setLine(null);
  };
  // A chosen line counts only while its row is in the table, which an import or showing mode can take away.
  const chosen = line ? data?.lines.find(({ label }) => label === line.label) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageTitle>Kits</PageTitle>
        <ListFilters query={query} projects={projects} onChange={set}>
          {options && options.kits.length > 0 && (
            <label className="flex items-center gap-1.5">
              Kit
              <select
                value={options.kits.find((name) => name === query.kit) ?? data?.kit ?? options.kit ?? ''}
                onChange={(e) => set({ kit: e.target.value })}
              >
                {options.kits.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </ListFilters>
      </div>
      {kits.isPending && <State>Loading the kits…</State>}
      {kits.isError && (
        <State error>Couldn't load the kits. Check that the dashboard server is running, then refresh.</State>
      )}
      {data &&
        (data.kit === null ? (
          <State>No kit has run yet. A kit shows here once a run that uses one is imported.</State>
        ) : data.projects.length === 0 ? (
          <State>{`The ${data.kit} kit ran in none of these runs.`}</State>
        ) : (
          <KitSections response={data} chosen={chosen} onChoose={setLine} />
        ))}
    </div>
  );
}
