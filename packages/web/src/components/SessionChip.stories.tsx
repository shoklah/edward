import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, mocked, spyOn, waitFor, within } from 'storybook/test';
import { TERM } from './Panel.tsx';
import { SessionChip } from './SessionChip.tsx';

const ID = '7d1e4b2a-9c3f-4a8e-b5d6-1f2e3a4b5c6d';

const meta = {
  component: SessionChip,
  args: { id: ID },
  beforeEach: () => {
    spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  },
} satisfies Meta<typeof SessionChip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A chip always has an ID, so it has one data state; hovering and copying are its interactions. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByText('7d1e4b2a');
    await expect(canvas.queryByText(ID)).toBeNull();
    await expect(name).toHaveClass(...TERM.split(' '));

    await userEvent.hover(name);
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(ID);

    const copy = canvas.getByRole('button', { name: 'Copy session ID' });
    await userEvent.click(copy);
    await expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ID);
    await waitFor(() => expect(copy.querySelector('.lucide-check')).toBeVisible());
    await expect(canvas.getByText('Copied')).toHaveAttribute('aria-live', 'polite');
  },
};

/** A failed copy says so after the chip, in fixed words. */
export const CopyFails: Story = {
  beforeEach: () => {
    mocked(navigator.clipboard.writeText).mockRejectedValue(new Error());
  },
  play: async ({ canvas, userEvent }) => {
    const copy = canvas.getByRole('button', { name: 'Copy session ID' });
    await userEvent.click(copy);
    const line = await canvas.findByText("Couldn't copy it. Try again.");
    await expect(line).toBeVisible();
    await expect(line.getBoundingClientRect().left).toBeGreaterThan(copy.getBoundingClientRect().left);
  },
};

export const Focused: Story = {
  play: async ({ userEvent }) => {
    await userEvent.tab();
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(ID);
  },
};
