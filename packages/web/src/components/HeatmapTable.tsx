import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { cellShade, formatCount, total, weekLabel } from '../lib/format.ts';
import { useRipple } from '../motion/index.ts';
import { NUM, Num } from './Num.tsx';

/** A cell of a heatmap: its row's id and a week. */
export type HeatmapSelection = { id: string; week: string };

/** A row of a heatmap: `id` identifies it in the selection, `name` heads it and names it in its cells' labels;
 * `extras` are its cells in the extra columns. */
export type HeatmapRow = { id: string; name: string; values: (number | null)[]; extras?: ReactNode[] };

/** A group of rows, under a full-width heading row unless its heading is null. */
export type HeatmapGroup = { heading: ReactNode | null; rows: HeatmapRow[] };

/** A cell's button, its number written in it. */
function Cell({ label, text, shade, pressed, onClick }: { label: string; text: string; shade: string; pressed: boolean; onClick: () => void }) {
  const { ref, children } = useRipple<HTMLButtonElement>(text);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}: ${text}`}
      onClick={onClick}
      className={cn(
        'h-8 w-full min-w-12 rounded-sm px-1 text-sm whitespace-nowrap tabular-nums',
        shade,
        pressed && 'outline-2 outline-offset-1 outline-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Rows down and the weeks across, each cell a button with its number written in it (`format`, a count by default), so
 * the heatmap is its own table view. One blue ramp shades the cells against `max`, the grey for 0 or an unknown value.
 * It scrolls sideways over many weeks, in a region named `label`; `corner` heads the rows' column. With `total`, a last
 * "Total" column holds each row's values summed, written by `format` too (muted when 0); `extras` heads numeric columns
 * after it, each row giving their cells.
 */
export function HeatmapTable({
  label,
  corner,
  weeks,
  groups,
  max,
  format = formatCount,
  total: withTotal = false,
  extras = [],
  selected,
  onSelect,
}: {
  label: string;
  corner: string;
  weeks: string[];
  groups: HeatmapGroup[];
  max: number;
  format?: (value: number | null) => string;
  total?: boolean;
  extras?: string[];
  selected: HeatmapSelection | null;
  onSelect: (cell: HeatmapSelection) => void;
}) {
  const labels = weeks.map(weekLabel);
  return (
    // Its container is a named tab stop for keyboard users, since it scrolls sideways.
    <Table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': label }}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{corner}</TableHead>
          {weeks.map((week, i) => (
            <TableHead key={week} className="text-center">
              {labels[i]}
            </TableHead>
          ))}
          {withTotal && <TableHead className={NUM}>Total</TableHead>}
          {extras.map((extra) => (
            <TableHead key={extra} className={NUM}>
              {extra}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      {groups.map((group, g) => (
        <TableBody key={g}>
          {group.heading !== null && (
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead
                scope="rowgroup"
                colSpan={weeks.length + extras.length + (withTotal ? 2 : 1)}
                className="h-8 pt-2 text-xs font-medium text-muted-foreground"
              >
                {group.heading}
              </TableHead>
            </TableRow>
          )}
          {group.rows.map((row) => (
            <TableRow key={row.id} className="border-0 hover:bg-transparent">
              <TableHead scope="row" className="w-px font-normal whitespace-nowrap">
                {row.name}
              </TableHead>
              {row.values.map((value, i) => {
                const week = weeks[i];
                return (
                  <TableCell key={week} className="p-0.5">
                    <Cell
                      label={`${row.name}, week of ${labels[i]}`}
                      text={format(value)}
                      shade={cellShade(value ?? 0, max)}
                      pressed={selected?.id === row.id && selected.week === week}
                      onClick={() => onSelect({ id: row.id, week })}
                    />
                  </TableCell>
                );
              })}
              {withTotal && (
                <TableCell className={NUM}>
                  <Num value={total(row.values)} format={format} />
                </TableCell>
              )}
              {row.extras?.map((extra, i) => (
                <TableCell key={i} className={NUM}>
                  {extra}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  );
}
