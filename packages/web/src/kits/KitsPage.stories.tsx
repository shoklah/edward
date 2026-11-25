import type { Meta, StoryObj } from '@storybook/react-vite';
import { useQueryClient } from '@tanstack/react-query';
import { expect, screen, waitFor, within } from 'storybook/test';
import type { StatusResponse } from '@cwd/shared';
import { kitsFull, kitsIdle, kitsNone, kitsShowing } from '../test/kits.ts';
import { mockApi } from '../test/mock-api.ts';
import { runsFull } from '../test/runs.ts';
import { cells, expectColgroups, expectNoJoined, openedRow, visibleFact, visibleTerms, width } from '../test/table.ts';
import { KitsPage } from './KitsPage.tsx';

const meta = { component: KitsPage } satisfies Meta<typeof KitsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const AT = '2026-11-12T10:00:00.000Z';
const status: StatusResponse = { lastImportAt: AT, lastGoodImportAt: AT, error: null, importing: false };
// The project filter's options: every project of the last 52 weeks.
const projects = { '/api/runs?weeks=52': runsFull };

/** A table's body rows, each as its row header's text, when it has one, then its cells'. */
const rowsOf = (region: string) =>
  [...screen.getByRole('region', { name: region }).querySelectorAll<HTMLElement>('tbody tr')].map((tr) => [
    ...[...tr.querySelectorAll('th')].map((th) => th.textContent),
    ...cells(tr),
  ]);

const NO_WARNINGS = 'No kit warnings in these runs.';

export const Loading: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': 'pending' });
  },
  play: async ({ canvas }) => {
    const state = await canvas.findByText('Loading the kits…');
    await expect(state).toBeVisible();
    await expect(state.closest('.glass')).not.toBeNull();
  },
};

export const Failed: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': 500 });
  },
  play: async ({ canvas }) => {
    const state = await canvas.findByText(
      "Couldn't load the kits. Check that the dashboard server is running, then refresh.",
    );
    await expect(state).toBeVisible();
    await expect(state.closest('.glass')).not.toBeNull();
  },
};

/** No kit in any stored run: the page says how it fills, with no Kit filter. */
export const NoKit: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsNone });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('No kit has run yet. A kit shows here once a run that uses one is imported.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('combobox', { name: 'Kit' })).toBeNull();
  },
};

/** The kit ran in none of the period's runs: one line in place of the sections, with the Kit filter. */
export const NotInPeriod: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsIdle });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('The ui kit ran in none of these runs.')).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Kit' })).toHaveValue('ui');
    await expect(canvas.queryByRole('region', { name: 'Checklist lines' })).toBeNull();
  },
};

/**
 * Full: the kit's five sections, in order: its reviews beside the runs' other reviews, its checklist lines with how
 * their findings ended, where it ran (a project's paths under its name), its versions and its warnings, newest first,
 * each opening to its text.
 */
export const Full: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsFull });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const kit = await canvas.findByRole('combobox', { name: 'Kit' });
    await expect(kit).toHaveValue('ui');
    await expect(within(kit).getAllByRole('option').map((o) => o.textContent)).toEqual(['prose', 'ui']);
    await expect(canvas.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      "Reviews in the kit's runs",
      'Checklist lines',
      'Where it ran',
      'By version',
      'Warnings',
    ]);
    await expect(rowsOf("Reviews in the kit's runs table")[0]).toEqual(['Kit review', '41', '14', '2', '100', '12', '58', '46', '28', '2', '10', '36.40']);
    await expect(rowsOf('Checklist lines table')[1]).toEqual(['Every width', '2', '4', '6', '12', '4', '3', '4', '0', '1', '33%', '0']);
    await expect(rowsOf('Where it ran table').slice(0, 2)).toEqual([
      ['lantern-notes', 'Full', '7', '22', '22', '6', '7', '86', '24', '33', '6', '19.30', '11'],
      ['Small', '6', '–not known', '6', '2', '4', '25', '8', '25', '2', '6.85', '18'],
    ]);
    await expect(rowsOf('By version table')[0]).toEqual(['0.2.0', '12', '27', '11', '1.1', '7', '71', '23', '30', '27', '0', '1']);
    await expect(rowsOf('Warnings table').map((r) => r.slice(0, 4))).toEqual([
      ['Kit checks not passed', 'Offline notes sync when the device reconnects', 'lantern-notes', 'New'],
      ['Kit review missing', 'Webhooks retry with backoff', 'tidepool-api', 'Seen'],
    ]);
    await expectColgroups(canvasElement);
    await expectNoJoined(canvasElement);

    const toggle = canvas.getByRole('button', { name: 'Kit checks not passed' });
    await userEvent.click(toggle);
    await expect(visibleFact(openedRow(toggle), 'Warning')).toHaveTextContent(
      "Kit ui: the last check of task 3 couldn't run",
    );
  },
};

/** A pressed line marks its row and lists its findings under the table; pressing it again, or a filter, closes them. */
export const ChosenLine: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsFull, '/api/kits?weeks=12': kitsFull });
  },
  play: async ({ canvas, userEvent }) => {
    const listed = () => canvas.queryByRole('region', { name: '12 findings of "Every width"' });
    const line = await canvas.findByRole('button', { name: 'Every width' });
    await expect(line).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(line);
    await expect(line).toHaveAttribute('aria-pressed', 'true');
    await expect(line.closest('tr')).toHaveAttribute('data-state', 'selected');
    const list = within(listed()!);
    await expect(list.getByRole('combobox', { name: 'Severity' })).toBeVisible();
    await expect(list.getByRole('combobox', { name: 'Outcome' })).toBeVisible();
    await expect(list.queryByRole('combobox', { name: 'Step' })).toBeNull();
    await expect(list.getByText('1–10 of 12')).toBeVisible();

    await userEvent.click(line);
    await expect(listed()).toBeNull();
    await expect(line).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(line);
    await expect(listed()).toBeVisible();
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Period' }), '12');
    await expect(listed()).toBeNull();
  },
};

/** A finding with no label sits in a row of its own, the dash read "no line". */
export const NoLine: Story = {
  beforeEach: () => {
    const line = { ...kitsFull.lines[0], label: null, critical: 0, important: 0, minor: 1, total: 1, actedOn: 1, deferred: 0, toOwner: 0, noAction: 0, invalid: 0 };
    mockApi({
      '/api/status': status,
      ...projects,
      '/api/kits?weeks=4': { ...kitsFull, lines: [line], findings: [{ ...kitsFull.findings[6], label: null, outcome: 'fixed' }] },
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'no line' }));
    await expect(canvas.getByRole('heading', { name: '1 finding with no line' })).toBeVisible();
    await expect(canvas.getByText('The sync banner covers the search field at 375 px.')).toBeVisible();
  },
};

export const NoFindings: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': { ...kitsFull, lines: [], findings: [] } });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('cell', { name: 'No findings' })).toHaveAttribute('colspan', '12');
  },
};

export const NoWarnings: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': { ...kitsFull, warnings: [] } });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(NO_WARNINGS)).toBeVisible();
  },
};

/** Showing mode: the hidden projects are one last item, and the lists' lines count what they leave out; the warnings,
 * all hidden, aren't said to be none. */
export const Showing: Story = {
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsShowing });
  },
  play: async ({ canvas }) => {
    const where = within(await canvas.findByRole('region', { name: 'Where it ran table' }));
    await expect(where.getAllByRole('rowheader').at(-1)).toHaveTextContent(/^Other projects$/);
    await expect(canvas.getByText('+ 5 findings in other projects, counted in totals and charts only')).toBeVisible();
    await expect(canvas.getByText('+ 2 warnings in other projects, counted in totals and charts only')).toBeVisible();
    await expect(canvas.queryByText(NO_WARNINGS)).toBeNull();
  },
};

/** The picked kit goes to the API with the other filters, last, and the select shows it while it loads. */
export const Filters: Story = {
  beforeEach: () => {
    mockApi({
      '/api/status': status,
      ...projects,
      '/api/kits?weeks=4': kitsFull,
      '/api/kits?weeks=4&kit=prose': 'pending',
      '/api/kits?path=full&weeks=4&kit=prose': kitsIdle,
    });
  },
  play: async ({ canvas, userEvent }) => {
    const kit = await canvas.findByRole('combobox', { name: 'Kit' });
    await userEvent.selectOptions(kit, 'prose');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/kits?weeks=4&kit=prose'));
    await expect(kit).toHaveValue('prose');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Path' }), 'full');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/kits?path=full&weeks=4&kit=prose'));
  },
};

/** A pick that fails keeps the Kit filter, so it can be undone. */
export const FailedPick: Story = {
  beforeEach: () => {
    mockApi({
      '/api/status': status,
      ...projects,
      '/api/kits?weeks=4': kitsFull,
      '/api/kits?weeks=4&kit=ui': kitsFull,
      '/api/kits?weeks=4&kit=prose': 500,
    });
  },
  play: async ({ canvas, userEvent }) => {
    const kit = await canvas.findByRole('combobox', { name: 'Kit' });
    await userEvent.selectOptions(kit, 'prose');
    await expect(
      await canvas.findByText("Couldn't load the kits. Check that the dashboard server is running, then refresh."),
    ).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Kit' })).toHaveValue('prose');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Kit' }), 'ui');
    await expect(await canvas.findByRole('region', { name: 'Checklist lines' })).toBeVisible();
  },
};

// The answers LineGone changes as it runs, as an import or showing mode's start does.
const live: Record<string, object | number> = {};

/** A chosen line whose row then goes away: its findings close, and nothing names it. */
export const LineGone: Story = {
  beforeEach: () => {
    Object.assign(live, { '/api/status': status, ...projects, '/api/kits?weeks=4': kitsFull });
    mockApi(live);
  },
  // Showing mode's start resets every query, as this button does.
  render: function Render(args) {
    const client = useQueryClient();
    return (
      <>
        <button type="button" onClick={() => void client.resetQueries()}>
          Start showing
        </button>
        <KitsPage {...args} />
      </>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Every width' }));
    await expect(canvas.getByRole('heading', { name: '12 findings of "Every width"' })).toBeVisible();
    live['/api/kits?weeks=4'] = { ...kitsFull, lines: kitsFull.lines.filter((line) => line.label !== 'Every width') };

    await userEvent.click(canvas.getByRole('button', { name: 'Start showing' }));

    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Every width' })).toBeNull());
    await expect(await canvas.findByRole('button', { name: 'Reading order' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: /Every width/ })).toBeNull();
    await expect(canvas.queryByText(/Every width/)).toBeNull();
  },
};

/** Narrow: the warnings' project and whether it is new fold into the opened row, before the warning itself. */
export const Narrow: Story = {
  decorators: [width(375)],
  beforeEach: () => {
    mockApi({ '/api/status': status, ...projects, '/api/kits?weeks=4': kitsFull });
  },
  play: async ({ canvas, userEvent }) => {
    const table = within(await canvas.findByRole('region', { name: 'Warnings table' }));
    await expect(table.getByRole('columnheader', { name: 'Kind' })).toBeVisible();
    await expect(table.getByText('Project').closest('th')).not.toBeVisible();
    await expect(table.getByText('Since you last looked').closest('th')).not.toBeVisible();
    const toggle = table.getByRole('button', { name: 'Kit checks not passed' });
    await userEvent.click(toggle);
    await expect(visibleTerms(openedRow(toggle))).toEqual(['Project', 'Since you last looked', 'Warning']);
  },
};
