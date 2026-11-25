import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table.tsx';
import { NUM } from '../components/Num.tsx';
import { accessibleText, eachFrame, finish, fits, motionOn, played } from '../test/motion.ts';
import { width } from '../test/table.ts';
import { Drop } from './Drop.tsx';

const meta = {
  component: Drop,
  args: { old: '12', children: '15', delay: 0, drop: true, onDone: fn() },
  render: (args) => <Start draw={(started) => <p className="p-4">{started ? <Drop {...args} /> : args.old}</p>} />,
} satisfies Meta<typeof Drop>;
export default meta;
type Story = StoryObj<typeof meta>;

/** What `draw` draws before and after Start is pressed. */
function Start({ draw }: { draw: (started: boolean) => ReactNode }) {
  const [started, setStarted] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setStarted(true)}>Start</button>
      {draw(started)}
    </>
  );
}

/** A drop: the old number melts off and the new one forms inside a drop of glass, which then evaporates. */
export const Dropping: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const on = motionOn();
    await userEvent.click(canvas.getByRole('button'));
    const drop = canvasElement.querySelector('[data-drop="drop"]')!;
    await expect([...drop.children].map((el) => [el.tagName, el.getAttribute('aria-hidden'), el.textContent])).toEqual([
      ['I', 'true', ''],
      ['SPAN', 'true', '12'],
      ['SPAN', null, '15'],
    ]);
    await expect(accessibleText(drop)).toBe('15');
    const [glass, was, is] = drop.children;
    await expect(played(drop)).toEqual([
      { verb: 'ripple', ms: 374, el: was },
      { verb: 'ripple', ms: 1054, el: is },
      { verb: 'ripple', ms: 2550, el: glass },
    ]);
    await expect(args.onDone).not.toHaveBeenCalled();
    finish(drop);
    await waitFor(() => expect(args.onDone).toHaveBeenCalledTimes(1));
    on.mockRestore();
  },
};

/** A swap: no glass, the old number off and the new one on at once, when the front arrives. */
export const Swapping: Story = {
  args: { drop: false, delay: 5000 },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const on = motionOn();
    await userEvent.click(canvas.getByRole('button'));
    const [was, is] = canvasElement.querySelector('[data-drop="swap"]')!.children;
    const seen = () => [was, is].map((el) => getComputedStyle(el).opacity);
    await expect([was.textContent, is.textContent]).toEqual(['12', '15']);
    await expect(seen()).toEqual(['1', '0']);
    finish(canvasElement);
    await expect(seen()).toEqual(['0', '1']);
    await waitFor(() => expect(args.onDone).toHaveBeenCalledTimes(1));
    on.mockRestore();
  },
};

/** In a table that fits: nothing in it moves or scrolls, and the glass stays in the number's cell. */
export const Inside: Story = {
  decorators: [width(420)],
  render: (args) => (
    <Start
      draw={(started) => (
        <Table>
          <TableBody>
            {[false, started].map((dropping, row) => (
              <TableRow key={row}>
                {['12,345', '333.0K', '1,234,567,890'].map((text) => (
                  <TableCell key={text} className={NUM}>
                    <span>{dropping ? <Drop {...args}>{text}</Drop> : text}</span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    />
  ),
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const container = canvasElement.querySelector('[data-slot="table-container"]')!;
    const cells = [...canvasElement.querySelectorAll('tr:last-child td')];
    const rects = () => cells.map((cell) => cell.getBoundingClientRect().toJSON());
    /** A number's text as it is drawn. */
    const text = (cell: Element) => {
      const range = document.createRange();
      range.selectNodeContents([...cell.querySelectorAll('span')].at(-1)!);
      return range.getBoundingClientRect().toJSON();
    };
    const [at, numbers] = [rects(), cells.map(text)];
    fits(container);
    const on = motionOn();
    await userEvent.click(canvas.getByRole('button'));
    /** Where a number rests: its box less what the drop adds round it. */
    const rest = (cell: Element) => {
      const drop = cell.querySelector('[data-drop]')!;
      const { left, top, right, bottom } = drop.getBoundingClientRect();
      const { paddingLeft, paddingTop } = getComputedStyle(drop);
      const [x, y] = [parseFloat(paddingLeft), parseFloat(paddingTop)];
      return [left + x, top + y, right - x, bottom - y];
    };
    const resting = cells.map(rest);
    let frames = 0;
    let shown = 0;
    await eachFrame(canvasElement, () => {
      frames += 1;
      fits(container);
      expect(rects()).toEqual(at);
      expect(cells.map(rest)).toEqual(resting);
      for (const cell of cells.slice(0, 2)) {
        const [glass, box] = [cell.querySelector('i')!.getBoundingClientRect(), cell.getBoundingClientRect()];
        expect(glass.left).toBeGreaterThanOrEqual(box.left);
        expect(glass.right).toBeLessThanOrEqual(box.right);
        expect(glass.top).toBeGreaterThanOrEqual(box.top);
        expect(glass.bottom).toBeLessThanOrEqual(box.bottom);
        // It stands out of the number on every side.
        if (getComputedStyle(cell.querySelector('i')!).transform === 'none') {
          shown += 1;
          expect(glass.left).toBeLessThan(rest(cell)[0] - 2);
          expect(glass.top).toBeLessThan(rest(cell)[1] - 1);
        }
      }
      // At its end, the new number's text is drawn where it was before.
      if (frames === 40) {
        for (const [i, cell] of cells.entries()) {
          const now = text(cell);
          for (const side of ['left', 'top', 'right', 'bottom']) expect(now[side]).toBeCloseTo(numbers[i][side], 1);
        }
      }
    });
    await expect(shown).toBeGreaterThan(0);
    await waitFor(() => expect(args.onDone).toHaveBeenCalledTimes(3));
    on.mockRestore();
  },
};

/** A narrower new number, in a right-aligned cell with no right padding and in one padded all round, dropping and
 * swapping: the old one stands whole where it stood, inside its cell. */
export const Narrower: Story = {
  decorators: [width(420)],
  render: (args) => (
    <Start
      draw={(started) => (
        <table>
          <tbody>
            {[true, false].map((drop) => (
              <tr key={String(drop)}>
                {[['24', '2', 'py-0.5 pl-3'], ['12.4', '–', 'p-2']].map(([old, now, padding]) => (
                  <td key={old} className={`w-24 ${padding} ${NUM}`}>
                    <span>{started ? <Drop {...args} old={old} drop={drop}>{now}</Drop> : old}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  ),
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const numbers = [...canvasElement.querySelectorAll('td > span')];
    const at = numbers.map((el) => el.getBoundingClientRect());
    const on = motionOn();
    await userEvent.click(canvas.getByRole('button'));
    const boxes = [...canvasElement.querySelectorAll('[data-drop]')];
    await expect(boxes.map((box) => box.getAttribute('data-drop'))).toEqual(['drop', 'drop', 'swap', 'swap']);
    for (const [i, box] of boxes.entries()) {
      const was = box.querySelector(':scope > span[aria-hidden]')!.getBoundingClientRect();
      const clip = box.getBoundingClientRect();
      for (const side of ['left', 'top'] as const) await expect(was[side]).toBeGreaterThanOrEqual(clip[side] - 0.02);
      for (const side of ['right', 'bottom'] as const) await expect(was[side]).toBeLessThanOrEqual(clip[side] + 0.02);
      for (const side of ['left', 'right'] as const) await expect(was[side]).toBeCloseTo(at[i][side], 1);
      // The clip is the cell's, so the glass stays in it too.
      const cell = box.closest('td')!.getBoundingClientRect();
      for (const side of ['left', 'top', 'right', 'bottom'] as const) await expect(clip[side]).toBeCloseTo(cell[side], 1);
    }
    await expect(args.onDone).not.toHaveBeenCalled();
    finish(canvasElement);
    await waitFor(() => expect(args.onDone).toHaveBeenCalledTimes(4));
    on.mockRestore();
  },
};
