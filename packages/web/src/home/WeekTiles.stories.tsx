import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { emptyWeek, fullHome } from '../test/home.ts';
import { WeekTiles } from './WeekTiles.tsx';
import { expectNoJoined, width } from '../test/table.ts';

const meta = { component: WeekTiles } satisfies Meta<typeof WeekTiles>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Each row of a table as its cells' text, header cells included. */
const rows = (table: HTMLElement) =>
  [...table.querySelectorAll('tr')].map((tr) => [...tr.children].map((cell) => cell.textContent));

const TABLES = ['Runs', 'Findings', 'Usage this week (%)', 'Usage per run (%)', 'Warnings'];

/** The five small tables, in order, inside the "This week" panel. */
function tables(canvasElement: HTMLElement) {
  const panel = within(canvasElement).getByRole('region', { name: 'This week' });
  return TABLES.map((name) => within(panel).getByRole('table', { name }));
}

/** Empty: no runs this week or last; zeros stay, an unknown estimate is the dash read out as not known, and with no
 * unit left out there is no "Not estimated" row. */
export const EmptyWeek: Story = {
  args: { thisWeek: emptyWeek, lastWeek: emptyWeek },
  play: async ({ canvasElement }) => {
    const [runs, findings, usage, perRun, warnings] = tables(canvasElement);
    await expect(within(canvasElement).queryByRole('table', { name: 'Est. cost ($)' })).toBeNull();
    for (const table of [runs, findings, usage, perRun, warnings]) {
      await expect(rows(table)[0].slice(1)).toEqual(['This week', 'Last week']);
    }
    await expect(rows(runs).slice(1)).toEqual([
      ['All paths', '0', '0'],
      ['Small', '0', '0'],
      ['Full', '0', '0'],
      ['Plan', '0', '0'],
    ]);
    await expect(rows(findings).slice(1).map((row) => row[0])).toEqual(['Found', 'Acted on', 'Open']);
    await expect(rows(usage).slice(1)).toEqual([
      ['All models', '–not known', '–not known'],
      ['Fable', '–not known', '–not known'],
    ]);
    await expect(rows(perRun).slice(1)).toEqual([
      ['All models', '–not known', '–not known'],
      ['Fable', '–not known', '–not known'],
    ]);
    await expect(rows(warnings).slice(1).map((row) => row[0])).toEqual(['Current', 'New']);
  },
};

/** Full: each measure's parts, this week beside last week, one value per cell. */
export const FullWeek: Story = {
  args: { thisWeek: fullHome.thisWeek, lastWeek: fullHome.lastWeek },
  play: async ({ canvasElement }) => {
    const [runs, findings, usage, perRun, warnings] = tables(canvasElement);
    await expect(rows(runs)).toEqual([
      ['Runs', 'This week', 'Last week'],
      ['All paths', '6', '8'],
      ['Small', '3', '4'],
      ['Full', '2', '3'],
      ['Plan', '1', '1'],
    ]);
    await expect(rows(findings).slice(1)).toEqual([
      ['Found', '19', '15'],
      ['Acted on', '13', '12'],
      ['Open', '1', '0'],
    ]);
    // This week left a unit out, so its count shows under the estimates.
    await expect(rows(usage)).toEqual([
      ['Usage this week (%)', 'This week', 'Last week'],
      ['All models', '3.4', '4.2'],
      ['Fable', '2.1', '2.6'],
      ['Not estimated', '1', '0'],
    ]);
    await expect(rows(perRun)).toEqual([
      ['Usage per run (%)', 'This week', 'Last week'],
      ['All models', '0.5', '0.5'],
      ['Fable', '0.3', '0.3'],
    ]);
    await expect(rows(warnings).slice(1)).toEqual([
      ['Current', '12', '9'],
      ['New', '3', '0'],
    ]);
    for (const table of [runs, findings, usage, perRun, warnings]) {
      await expectNoJoined(table);
      // The numbers line up: their headers and cells right-aligned in tabular figures.
      for (const cell of table.querySelectorAll('td')) await expect(cell).toHaveClass('text-right', 'tabular-nums');
    }
  },
};

/** A week whose units have no estimate: a dash, not 0.0; a known 0 shows as 0.0, and "<0.1" below 0.05. */
export const UsageUnknown: Story = {
  args: {
    thisWeek: { ...fullHome.thisWeek, estimates: { all: null, fable: null, notEstimated: 3 }, perRun: { all: null, fable: null } },
    lastWeek: { ...fullHome.lastWeek, estimates: { all: 0.04, fable: 0, notEstimated: 0 }, perRun: { all: 0.01, fable: 0 } },
  },
  play: async ({ canvasElement }) => {
    const [, , usage, perRun] = tables(canvasElement);
    await expect(rows(usage).slice(1)).toEqual([
      ['All models', '–not known', '<0.1'],
      ['Fable', '–not known', '0.0'],
      ['Not estimated', '3', '0'],
    ]);
    await expect(rows(perRun).slice(1)).toEqual([
      ['All models', '–not known', '<0.1'],
      ['Fable', '–not known', '0.0'],
    ]);
  },
};

/** The panel as narrow as Home's at 768 px, beside the rail: each table takes the whole width, none runs into another. */
export const Narrow: Story = {
  args: { thisWeek: fullHome.thisWeek, lastWeek: fullHome.lastWeek },
  decorators: [width(500)],
  play: async ({ canvasElement }) => {
    const all = tables(canvasElement);
    const lefts = all.map((table) => Math.round(table.getBoundingClientRect().left));
    await expect(new Set(lefts).size).toBe(1);
    // No table is wider than its column, and every title stays on one line.
    for (const table of all) {
      await expect(table.scrollWidth).toBeLessThanOrEqual(table.parentElement!.clientWidth);
      const title = table.querySelector('th')!;
      await expect(title.getBoundingClientRect().height).toBeLessThan(30);
    }
  },
};

/** The panel as wide as Home's at 1440 px: two tables side by side, the usage tables together on one row. */
export const Wide: Story = {
  args: { thisWeek: fullHome.thisWeek, lastWeek: fullHome.lastWeek },
  decorators: [width(846)],
  play: async ({ canvasElement }) => {
    const [runs, findings, usage, perRun] = tables(canvasElement);
    const top = (el: HTMLElement) => Math.round(el.getBoundingClientRect().top);
    await expect(top(findings)).toBe(top(runs));
    await expect(top(perRun)).toBe(top(usage));
    await expect(usage.getBoundingClientRect().right).toBeLessThan(perRun.getBoundingClientRect().left);
  },
};
