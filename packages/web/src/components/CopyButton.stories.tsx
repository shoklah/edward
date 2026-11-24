import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, mocked, spyOn, waitFor } from 'storybook/test';
import { WARNING_INK } from '../lib/format.ts';
import { CopyButton } from './CopyButton.tsx';

const FAILED = "Couldn't copy it. Try again.";

const meta = {
  component: CopyButton,
  args: { text: 'EDWARD_TOKEN=ed_test' },
  decorators: [
    (Story) => (
      <div className="glass flex items-center gap-2 p-4">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  },
} satisfies Meta<typeof CopyButton>;
export default meta;
type Story = StoryObj<typeof meta>;

const announced = (canvasElement: HTMLElement) => canvasElement.querySelector('[aria-live="polite"]');
/** Longer than a copy shows as done, so a check that it went away doesn't give up first. */
const afterAMoment = { timeout: 4000 };

/** The text is copied, then the button says so for a moment, in its icon and its word, and to a screen reader. */
export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy' });
    await expect(announced(canvasElement)).toBeEmptyDOMElement();

    await userEvent.click(button);
    await expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith('EDWARD_TOKEN=ed_test');
    await waitFor(() => expect(button).toHaveAccessibleName('Copied'));
    await expect(button.querySelector('.lucide-check')).toBeVisible();
    await expect(announced(canvasElement)).toHaveTextContent('Copied');
    await expect(announced(canvasElement)).toHaveClass('sr-only');

    await waitFor(() => expect(button).toHaveAccessibleName('Copy'), afterAMoment);
    await expect(button.querySelector('.lucide-copy')).toBeVisible();
    await expect(announced(canvasElement)).toBeEmptyDOMElement();
  },
};

/** With a `label`, an icon-only button keeps that name: its icon alone shows the copy, and the word is only announced. */
export const IconOnly: Story = {
  args: { text: '7d1e4b2a-9c3f-4a8e-b5d6-1f2e3a4b5c6d', label: 'Copy session ID' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy session ID' });
    await userEvent.click(button);
    await expect(navigator.clipboard.writeText).toHaveBeenCalledWith('7d1e4b2a-9c3f-4a8e-b5d6-1f2e3a4b5c6d');
    await waitFor(() => expect(button.querySelector('.lucide-check')).toBeVisible());
    await expect(button).toHaveAccessibleName('Copy session ID');
    await expect(button).toHaveTextContent('');
    await expect(announced(canvasElement)).toHaveTextContent('Copied');
    await expect(announced(canvasElement)).toHaveClass('sr-only');

    await waitFor(() => expect(button.querySelector('.lucide-copy')).toBeVisible(), afterAMoment);
    await expect(announced(canvasElement)).toBeEmptyDOMElement();
  },
};

/** A second copy shows as done for its own moment, not only for what is left of the first one's. */
export const CopiedAgain: Story = {
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy' });
    await userEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await userEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(button).toHaveAccessibleName('Copied');
  },
};

/** A failed write says so in fixed words, never the error's, until a next try gets through. */
export const Fails: Story = {
  beforeEach: () => {
    mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new DOMException('Write permission denied.', 'NotAllowedError'));
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy' });
    await userEvent.click(button);
    const line = await canvas.findByText(FAILED);
    await expect(line).toBeVisible();
    await expect(line).toHaveClass(WARNING_INK);
    await expect(line).not.toHaveClass('sr-only');
    await expect(announced(canvasElement)).toHaveTextContent(FAILED);
    await expect(canvasElement).not.toHaveTextContent('Write permission denied.');
    await expect(button).toHaveAccessibleName('Copy');
    await expect(button.querySelector('.lucide-copy')).toBeVisible();

    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAccessibleName('Copied'));
    await expect(canvas.queryByText(FAILED)).toBeNull();
  },
};

/** An icon-only button's failure stands after it, so the button stays where it was clicked. */
export const IconOnlyFails: Story = {
  args: IconOnly.args,
  beforeEach: Fails.beforeEach,
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Copy session ID' });
    const left = button.getBoundingClientRect().left;
    await userEvent.click(button);
    const line = await canvas.findByText(FAILED);
    await expect(line).toBeVisible();
    await expect(line).toHaveClass(WARNING_INK);
    await expect(button.getBoundingClientRect().left).toBe(left);
    await expect(line.getBoundingClientRect().left).toBeGreaterThan(button.getBoundingClientRect().left);
  },
};
