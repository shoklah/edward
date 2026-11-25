import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Table, TableBody, TableHeader, TableRow } from '../components/ui/table.tsx';
import { cells } from '../test/table.ts';
import { FoundCells, FoundHeads } from './FoundPair.tsx';

const meta = {
  component: FoundCells,
  render: (args) => (
    <Table>
      <TableHeader>
        <TableRow>
          <FoundHeads />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <FoundCells {...args} />
        </TableRow>
      </TableBody>
    </Table>
  ),
} satisfies Meta<typeof FoundCells>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Findings found, and the whole percent of them acted on. */
export const Pair: Story = {
  args: { value: { found: 14, actedOn: 9 } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Found', 'Acted on (%)']);
    await expect(cells(canvas.getAllByRole('row')[1])).toEqual(['14', '64']);
  },
};

/** None found: no share. */
export const NoneFound: Story = {
  args: { value: { found: 0, actedOn: 0 } },
  play: async ({ canvas }) => {
    await expect(cells(canvas.getAllByRole('row')[1])).toEqual(['0', '–not known']);
  },
};
