import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Filters } from './Filters.tsx';

const meta = { component: Filters } satisfies Meta<typeof Filters>;
export default meta;
type Story = StoryObj<typeof meta>;

// It draws nothing itself: an element names one of its filters while a wave runs.
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!;
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    await expect(svg.getBoundingClientRect().width).toBe(0);
    await expect(getComputedStyle(svg)).toMatchObject({ position: 'absolute', pointerEvents: 'none' });
    const maps = (id: string) => [...svg.querySelectorAll(`#${id} feImage`)].map((img) => img.getAttribute('href')!.slice(0, 14));
    await expect(maps('motion-bend')).toEqual(['data:image/png']);
    await expect(maps('motion-wash')).toEqual(['data:image/png', 'data:image/png']);
    // The bend's ring is the wash's, whose second map is another: what the front has passed.
    const [ring, disc] = [...svg.querySelectorAll('#motion-wash feImage')].map((img) => img.getAttribute('href'));
    await expect(svg.querySelector('#motion-bend feImage')!.getAttribute('href')).toBe(ring);
    await expect(disc).not.toBe(ring);
  },
};
