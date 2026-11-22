import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { StatusResponse } from '@cwd/shared';
import { mockApi } from '../test/mock-api.ts';
import { runsFull } from '../test/runs.ts';
import { weeksEmpty, weeksFull } from '../test/weeks.ts';
import { WeeksPage } from './WeeksPage.tsx';
import { cells, expectNoJoined } from '../test/table.ts';

const meta = { component: WeeksPage } satisfies Meta<typeof WeeksPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const AT = '2026-11-12T10:00:00.000Z';
const status: StatusResponse = { lastImportAt: AT, lastGoodImportAt: AT, error: null, importing: false };
// The project filter's options: every project of the last 52 weeks.
const projects = { '/api/runs?weeks=52': runsFull };
const CHARTS = ['Runs', 'Final review findings', 'All-models usage (%)', 'Time per run (min)'];
const EMPTY = 'No runs in this period. A week fills once a run that finished in it is imported.';
const HEADERS = [
  'Week', 'Runs', 'Tasks', 'Final review findings', 'Fix rounds', 'Stops', 'Est. usage (%)', 'Time per run (min)',
  'Later fix commits',
  'Small', 'Full', 'Plan', 'Critical', 'Important', 'Minor', 'Not required', 'All models', 'Fable', 'Not estimated',
];
const USAGE_HEADERS = [
  'Week', 'Readings', 'Fable', 'All models',
  'Points', 'Rate ($/pt)', 'Fit error (± pt)', 'From',
  'Points', 'Fable rate ($/pt)', 'Other rate ($/pt)', 'Fit error (± pt)', 'From',
];
const NO_USAGE = 'No usage estimates in this export.';
const BORROWED = 'Rates borrowed from the week of Oct 25';

const table = (canvas: HTMLElement, name: string) =>
  within(within(within(canvas).getByRole('region', { name })).getByRole('table'));
export const Loading: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/weeks?weeks=12': 'pending' });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Loading the weeks…')).toBeVisible();
    await expect(canvas.getByText('Loading the weeks…').closest('.glass')).not.toBeNull();
  },
};

export const Failed: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/weeks?weeks=12': 500 });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Couldn't load the weeks.")).toBeVisible();
    await expect(canvas.getByText("Couldn't load the weeks.").closest('.glass')).not.toBeNull();
  },
};

/** Empty: twelve weeks of nothing, a line saying so, zeros muted, every unknown sum a dash, and no coverage note. */
export const Empty: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/weeks?weeks=12': weeksEmpty });
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText(EMPTY)).toBeVisible();
    const weeks = table(canvasElement, 'By week table');
    // Two header rows and twelve weeks.
    await expect(weeks.getAllByRole('row')).toHaveLength(14);
    const row = weeks.getAllByRole('row')[2];
    const unknown = '–not known';
    await expect(cells(row)).toEqual([
      '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', unknown, unknown, '0', unknown, '0',
    ]);
    // A zero is muted.
    for (const cell of within(row).getAllByRole('cell')) {
      await expect(cell.querySelector('.text-muted-foreground')).not.toBeNull();
    }
    await expect(cells(table(canvasElement, 'Full runs, with and without waves table').getAllByRole('row')[1])).toEqual(['0', '0', unknown]);
    await expect(canvas.queryByText(/the reporter can no longer read them/)).toBeNull();
    // An export without the reporter's calibration: the section says so, with no table and no borrowed week.
    const usage = within(canvas.getByRole('region', { name: 'Usage estimates' }));
    await expect(usage.getByText(NO_USAGE)).toBeVisible();
    await expect(usage.queryByRole('table')).toBeNull();
    await expect(canvas.queryByText(/Rates borrowed/)).toBeNull();
    await expectNoJoined(canvasElement);
  },
};

/**
 * Full: the last 12 weeks by default, four small multiples (one measure each, its unit in its title), the week table
 * as their table view, newest first with one value per cell, the Full runs' run time, and the coverage note.
 */
export const Full: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/weeks?weeks=12': weeksFull });
  },
  play: async ({ canvas, canvasElement }) => {
    // The scroll region names the table, so the table has no name of its own.
    await expect(within(await canvas.findByRole('region', { name: 'By week table' })).getByRole('table')).not.toHaveAccessibleName();
    const weeks = table(canvasElement, 'By week table');
    await expect(canvas.getByRole('combobox', { name: 'Period' })).toHaveValue('12');
    for (const title of CHARTS) await expect(canvas.getByRole('heading', { name: title })).toBeVisible();
    const charts = canvas.getAllByRole('img');
    await expect(charts).toHaveLength(4);
    // One chart per row at first, two across from sm, four from 2xl.
    const grid = charts[0].closest('section')!.parentElement!;
    await expect(grid).toHaveClass('sm:grid-cols-2', '2xl:grid-cols-4');

    await expect(within(canvas.getByRole('region', { name: 'By week' })).getByRole('heading', { name: 'By week' })).toBeVisible();
    await expect(weeks.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(HEADERS);
    const [, , newest, previous] = weeks.getAllByRole('row');
    await expect(within(newest).getByRole('rowheader')).toHaveTextContent('Nov 8');
    await expect(cells(newest)).toEqual([
      '4', '2', '1', '12', '0', '3', '8', '0', '8', '0', '3.4', '1.8', '0', '140', '1',
    ]);
    await expect(weeks.queryByRole('columnheader', { name: 'Usage (points)' })).toBeNull();
    // The week of Nov 1 borrowed its all-models rates, not its Fable ones: the marker, a focusable tooltip trigger named
    // by the week, sits before the all-models value only, its icon hidden from assistive tech.
    const [allModels, fable] = within(previous).getAllByRole('cell').slice(10, 12);
    await expect(allModels).toHaveTextContent(`${BORROWED}2.1`);
    const marker = within(allModels).getByText(BORROWED).parentElement!;
    await expect(marker).toHaveAttribute('tabindex', '0');
    await expect(marker.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(fable).toHaveTextContent('1.0');
    await expect(within(fable).queryByText(/Rates borrowed/)).toBeNull();
    await expect(canvas.getAllByText(BORROWED)).toHaveLength(1);
    // A duration is rounded to whole minutes.
    await expect(cells(previous).at(-2)).toBe('166');

    const fullRuns = within(canvas.getByRole('region', { name: 'Full runs, with and without waves' }));
    await expect(fullRuns.getByRole('heading', { name: 'Full runs, with and without waves' })).toBeVisible();
    const runTime = table(canvasElement, 'Full runs, with and without waves table');
    await expect(runTime.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Kind', 'Runs', 'With a run time', 'Median time (min)',
    ]);
    await expect(runTime.getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      'With waves33150',
      'Without waves43185',
    ]);
    // The numeric columns, headers included, are right-aligned in tabular figures; the week and the kind aren't.
    const aligned = (cell: Element) => {
      const style = getComputedStyle(cell);
      return style.textAlign === 'right' && style.fontVariantNumeric === 'tabular-nums';
    };
    for (const row of weeks.getAllByRole('row').slice(2, 4)) {
      await expect([...row.children].map(aligned)).toEqual([false, ...Array(15).fill(true)]);
    }
    for (const row of runTime.getAllByRole('row').slice(0, 2)) {
      await expect([...row.children].map(aligned)).toEqual([false, true, true, true]);
    }

    await expect(canvas.getByText(/the reporter can no longer read them/)).toHaveTextContent(
      'Weeks before Oct 13 show what was stored; the reporter can no longer read them.',
    );

    // The reporter's weekly calibration: a panel marked as the reporter's, a row per week, newest first, each limit's
    // points, rates (two decimals), fit error (one decimal) and the week its rates were borrowed from.
    const usageRegion = canvas.getByRole('region', { name: 'Usage estimates' });
    await expect(usageRegion).toHaveClass('glass');
    await expect(within(usageRegion).getByText('reporter')).toHaveAttribute('tabindex', '0');
    const usage = table(canvasElement, 'Usage estimates table');
    await expect(usage.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(USAGE_HEADERS);
    const usageRows = usage.getAllByRole('row').slice(2);
    await expect(usageRows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Nov 8', 'Nov 1', 'Oct 25']);
    await expect(cells(usageRows[0])).toEqual([
      '14', '9.0', '5.80', '1.1', '–not borrowed', '7.2', '12.50', '25.00', '0.9', '–not borrowed',
    ]);
    await expect(cells(usageRows[1])).toEqual([
      '3', '9.0', '5.80', '1.1', '–not borrowed', '7.2', '12.50', '25.00', '–not known', 'Oct 25',
    ]);
    // A known fit error under 0.05 points is "<0.1", not a zero.
    await expect(cells(usageRows[2])[3]).toBe('<0.1');
    // Each head on one line, so a narrow page scrolls the table sideways; rows as tight as the panel's other tables.
    const usageTable = usageRows[0].closest('table')!;
    for (const head of usage.getAllByRole('columnheader')) await expect(getComputedStyle(head).whiteSpace).toBe('nowrap');
    for (const row of usageRows) {
      await expect(row.getBoundingClientRect().height).toBeLessThan(36);
    }
    await expect(usageTable.querySelectorAll('[data-slot]')).toHaveLength(0);
    for (const row of usageRows) {
      await expect([...row.children].map(aligned)).toEqual([false, ...Array(4).fill(true), false, ...Array(4).fill(true), false]);
    }
    await expect(canvas.queryByText(NO_USAGE)).toBeNull();
    await expect(canvas.queryByText(EMPTY)).toBeNull();
    await expectNoJoined(canvasElement);
  },
};

/** The path, project and period filters go to the API as query params. */
export const Filters: Story = {
  beforeEach: () => {
    mockApi({
      '/api/status': status,
      ...projects,
      '/api/weeks?weeks=12': weeksFull,
      '/api/weeks?path=full&weeks=12': weeksFull,
      '/api/weeks?path=full&weeks=4': weeksFull,
    });
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('region', { name: 'By week table' });
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Path' }), 'full');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Period' }), '4');
    await expect(fetch).toHaveBeenCalledWith('/api/weeks?path=full&weeks=4');
  },
};
