import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { parseTime } from '@cwd/shared';
import { Panel } from '../components/Panel.tsx';
import { WARNING_INK, formatDayTime } from '../lib/format.ts';
import { eachFrame, fits, motionOn, played } from '../test/motion.ts';
import { runFull, runKits, runLong, runPlanPair, runPlanTwice, runSmall } from '../test/runs.ts';
import { width } from '../test/table.ts';
import { stagesOf, unitsOf } from './flow.ts';
import { RunFlow } from './RunFlow.tsx';

const meta = { component: RunFlow, args: { stages: stagesOf(runFull.timeline), selected: null, onSelect: fn() } } satisfies Meta<
  typeof RunFlow
>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every element `selector` finds shows its whole text: every exit chip where the box leaves it room, unless it says. */
async function whole(flow: HTMLElement, selector = '.border-dashed') {
  for (const el of flow.querySelectorAll(selector)) await expect(el.scrollWidth, el.textContent!).toBeLessThanOrEqual(el.clientWidth);
}

/** `a` comes before `b` in the document. */
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** Empty: a run with no step between its start and its end draws its two pills only. */
export const Empty: Story = {
  args: { stages: stagesOf([runFull.timeline[0], runFull.timeline.at(-1)!]) },
  decorators: [width(720)],
  play: async ({ canvas }) => {
    const flow = canvas.getByRole('group', { name: "The run's flow" });
    await expect(within(flow).queryAllByRole('button')).toHaveLength(0);
    await expect(within(flow).getByText('Started')).toBeVisible();
    await expect(within(flow).getByText('Record written')).toBeVisible();
  },
};

/** A Small run: its two pills, each with its time, and its two boxes, which found nothing. */
export const Small: Story = {
  args: { stages: stagesOf(runSmall.timeline) },
  decorators: [width(720)],
  play: async ({ canvas }) => {
    const flow = within(canvas.getByRole('group', { name: "The run's flow" }));
    for (const [name, at] of [
      ['Started', runSmall.timeline[0].at!],
      ['Record written', runSmall.timeline.at(-1)!.at!],
    ]) {
      const pill = flow.getByText(name).parentElement!;
      await expect(within(pill).getByText(formatDayTime(parseTime(at)))).toBeVisible();
    }
    // Found 0: the zero muted.
    const final = flow.getByRole('button', { name: /^Final review/ });
    await expect(within(final).getByText('0')).toHaveClass('text-muted-foreground');
  },
};

/** Full: a box per unit, each naming its reviewer and what it found; pressing one selects it. A stuck loop's label is
 * in the warning ink with its rounds as text; a step's chips, and a wave's conflicts after its tasks. */
export const Full: Story = {
  decorators: [width(1100)],
  play: async ({ canvas, args, userEvent }) => {
    const group = canvas.getByRole('group', { name: "The run's flow" });
    const flow = within(group);
    await expect(flow.getAllByRole('button')).toHaveLength(unitsOf(args.stages).length);

    const task1 = flow.getByRole('button', { name: /^Task 1(?!\d)/ });
    await expect(task1).toHaveTextContent('task-reviewer');
    await expect(task1).toHaveTextContent('Found 2');
    await expect(task1).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(task1);
    await expect(args.onSelect).toHaveBeenCalledWith('t1');

    const check = flow.getByRole('button', { name: /^Wave A check/ });
    // A stuck loop says so by an icon and, to a screen reader, in words, not by its colour alone.
    const rounds = flow.getByText('3 rounds, the last left findings open');
    await expect(rounds).toHaveClass('sr-only');
    const label = rounds.parentElement!;
    await expect(label).toHaveTextContent('fix-checker');
    await expect(label).toHaveClass(WARNING_INK);
    await expect(label.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await expect(before(check, label)).toBe(true);
    const ruled = flow.getByText('Ruled 1');
    await expect(ruled).toBeVisible();
    await expect(before(check, ruled)).toBe(true);

    const conflicts = flow.getByText('1 conflict');
    await expect(conflicts).toHaveClass('text-muted-foreground');
    await expect(before(flow.getByRole('button', { name: /^Task 4(?!\d)/ }), conflicts)).toBe(true);
    await whole(group);
    // A loop that left nothing is not in the warning ink.
    const clean = flow.getAllByText('1 round')[0].parentElement!;
    await expect(clean).not.toHaveClass(WARNING_INK);
    await expect(clean.querySelector('svg')).toBeNull();
  },
};

/** The selection rings in the flow. */
const rings = (flow: HTMLElement) => [...flow.querySelectorAll<HTMLElement>('[data-ring]')];
const rect = (el: Element) => el.getBoundingClientRect().toJSON();

/** Selected: the box shows as pressed, with the ring at its place and no outline of its own, and pressing it again
 * clears the selection. */
export const Selected: Story = {
  args: { selected: 't1' },
  decorators: [width(1100)],
  play: async ({ canvas, canvasElement, args, userEvent }) => {
    const task1 = canvas.getByRole('button', { name: /^Task 1(?!\d)/ });
    await expect(task1).toHaveAttribute('aria-pressed', 'true');
    await expect(task1.className).not.toContain('outline');
    const [ring] = rings(canvasElement);
    await expect(ring).toHaveAttribute('aria-hidden', 'true');
    await expect(rect(ring)).toEqual(rect(task1));
    await userEvent.click(task1);
    await expect(args.onSelect).toHaveBeenCalledWith(null);
  },
};

/** The ring flows from a selected box to the next: a first selection, or none, changes at once. */
export const RingFlows: Story = {
  decorators: [width(1100)],
  render: function Selecting(args) {
    const [selected, select] = useState<string | null>(null);
    return <RunFlow {...args} selected={selected} onSelect={select} />;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const task1 = canvas.getByRole('button', { name: /^Task 1(?!\d)/ });
    const check = canvas.getByRole('button', { name: /^Wave A check/ });
    const pressed = () => [task1, check].map((box) => box.getAttribute('aria-pressed'));
    motionOn();
    await expect(rings(canvasElement)).toHaveLength(0);
    await userEvent.click(task1);
    await expect(rings(canvasElement)).toHaveLength(1);
    const [ring] = rings(canvasElement);
    await expect(ring).toHaveAttribute('aria-hidden', 'true');
    await expect(rect(ring)).toEqual(rect(task1));
    await expect(played(canvasElement)).toEqual([]);
    await expect(pressed()).toEqual(['true', 'false']);

    await userEvent.click(check);
    await expect(rings(canvasElement)).toEqual([ring]);
    await expect(played(canvasElement)).toEqual([{ verb: 'flow', ms: 420, el: ring }]);
    // It starts at the first box's place.
    const [flow] = ring.getAnimations();
    flow.pause();
    flow.currentTime = 0;
    await expect(rect(ring)).toEqual(rect(task1));
    flow.finish();
    await expect(rect(ring)).toEqual(rect(check));
    await expect(pressed()).toEqual(['false', 'true']);

    await userEvent.click(check);
    await expect(rings(canvasElement)).toHaveLength(0);
    await expect(played(canvasElement)).toEqual([]);
    await expect(pressed()).toEqual(['false', 'false']);
  },
};

/** 28 tasks in two rows, the first row's last box at the row's end. */
const long = stagesOf([
  runFull.timeline[0],
  ...Array.from({ length: 28 }, (_, i) => ({ ...runFull.timeline[0], kind: 'task' as const, label: `Task ${i + 1}`, tasks: [{ task: i + 1, steps: [] }] })),
  runFull.timeline.at(-1)!,
]);

/** The ring springs past the row's last box and the page doesn't scroll: the app's root is clipped while the ring flows,
 * also when the ring is gone by then, and no longer. */
export const RingFits: Story = {
  args: { stages: long },
  decorators: [
    (Story) => (
      // The page's room around a panel 2314 px wide inside.
      <div data-testid="page" className="overflow-auto p-4" style={{ width: 2314 + 66 }}>
        <div id="root">
          <Panel title="Flow">
            <Story />
          </Panel>
        </div>
      </div>
    ),
  ],
  render: RingFlows.render,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const overflow = () => getComputedStyle(document.getElementById('root')!).overflow;
    const boxes = canvas.getAllByRole('button');
    const top = boxes[0].offsetTop;
    const last = boxes.filter((box) => box.offsetTop === top).at(-1)!;
    motionOn();
    await userEvent.click(boxes[0]);
    await expect(overflow()).toBe('visible');
    await userEvent.click(last);
    await expect(overflow()).toBe('clip');
    await eachFrame(canvasElement, () => fits(canvas.getByTestId('page')));
    await waitFor(() => expect(overflow()).toBe('visible'));

    // Cleared while the ring flows.
    await userEvent.click(boxes[0]);
    await expect(overflow()).toBe('clip');
    await userEvent.click(boxes[0]);
    await expect(rings(canvasElement)).toHaveLength(0);
    await waitFor(() => expect(overflow()).toBe('visible'));
  },
};

/** Each box's lines: its name, what is under it and what it found. */
const lines = (flow: HTMLElement) => within(flow).getAllByRole('button').map((box) => [...box.children].map((line) => line.textContent));

/** A plan pair: each box names its plan under its kind, in place of its reviewer, and no line is cut. */
export const PlanPair: Story = {
  args: { stages: stagesOf(runPlanPair.timeline) },
  decorators: [width(900)],
  play: async ({ canvas }) => {
    const flow = canvas.getByRole('group', { name: "The run's flow" });
    await expect(lines(flow)).toEqual([
      ['Plan simplify', 'xhigh plan', 'Found 1'],
      ['Plan review', 'xhigh plan', 'Found 1'],
      ['Plan simplify', 'medium plan', 'Found 1'],
      ['Plan review', 'medium plan', 'Found 1'],
    ]);
    await whole(flow, 'button > *, .border-dashed');
  },
};

/** A plan reviewed twice, with no plan to name: its reviews numbered, its one simplify not. */
export const PlanTwice: Story = {
  args: { stages: stagesOf(runPlanTwice.timeline) },
  decorators: [width(900)],
  play: async ({ canvas }) => {
    await expect(lines(canvas.getByRole('group', { name: "The run's flow" }))).toEqual([
      ['Plan simplify', 'plan-simplifier', 'Found 0'],
      ['Plan review 1', 'plan-reviewer', 'Found 0'],
      ['Plan review 2', 'plan-reviewer', 'Found 0'],
    ]);
  },
};

/** Long: a kit-reviewed task's two boxes, and Task 10's chips, its open one in the warning ink. */
export const Long: Story = {
  args: { stages: stagesOf(runLong.timeline) },
  decorators: [width(1392)],
  play: async ({ canvas }) => {
    const flow = within(canvas.getByRole('group', { name: "The run's flow" }));
    await expect(flow.getByRole('button', { name: /^Task 7\s*task-reviewer/ })).toBeVisible();
    await expect(flow.getByRole('button', { name: /^Task 7 kit review/ })).toBeVisible();
    const task10 = flow.getByRole('button', { name: /^Task 10(?!\d)/ });
    const open = flow.getByText('Open 1');
    const deferred = flow.getAllByText('Deferred 1').find((chip) => before(task10, chip))!;
    await expect(before(task10, open)).toBe(true);
    await expect(deferred).toBeVisible();
    await expect(open).toHaveClass(WARNING_INK);
    await expect(deferred).toHaveClass('text-muted-foreground');
    await whole(canvas.getByRole('group', { name: "The run's flow" }));
  },
};

/** A kit's checks that failed or couldn't run: one chip on their task's own box, in the warning ink. */
export const KitChecks: Story = {
  args: { stages: stagesOf(runKits.timeline, runKits) },
  decorators: [width(1100)],
  play: async ({ canvas }) => {
    const group = canvas.getByRole('group', { name: "The run's flow" });
    const flow = within(group);
    for (const [text, box, next] of [
      ['Checks failed', /^Task 2\s*task-reviewer/, /^Task 2 kit review/],
      ['Not verified', /^Task 3\s*task-reviewer/, /^Task 3 kit review/],
    ] as const) {
      const chip = flow.getByText(text);
      await expect(chip).toHaveClass(WARNING_INK);
      await expect(before(flow.getByRole('button', { name: box }), chip)).toBe(true);
      await expect(before(chip, flow.getByRole('button', { name: next }))).toBe(true);
    }
    await whole(group);
  },
};

/** Long on a phone: standing up, it never scrolls sideways. */
export const LongUpright: Story = {
  args: { stages: stagesOf(runLong.timeline) },
  decorators: [width(343)],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Task 10(?!\d)/ })).toBeVisible();
    const frame = canvas.getByTestId('frame');
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  },
};
