import { cn } from 'cn';
import type { Found } from '@cwd/shared';
import { NUM, Num, SUB } from '../components/Num.tsx';
import { TableCell, TableHead } from '../components/ui/table.tsx';

/** Two severities' findings as one. */
export function together(a: Found, b: Found): Found {
  return { found: a.found + b.found, actedOn: a.actedOn + b.actedOn };
}

/** A group's numeric sub-column headers. */
export function SubHeads({ columns }: { columns: string[] }) {
  return columns.map((column) => (
    <TableHead key={column} className={cn(SUB, NUM)}>
      {column}
    </TableHead>
  ));
}

/** The pair's two sub-column headers, under their group's. */
export function FoundHeads() {
  return <SubHeads columns={['Found', 'Acted on (%)']} />;
}

/** The pair's two cells: the findings found, and the whole percent of them acted on, not known when none was found. */
export function FoundCells({ value }: { value: Found }) {
  return (
    <>
      <TableCell className={NUM}>
        <Num value={value.found} />
      </TableCell>
      <TableCell className={NUM}>
        <Num value={value.found ? (100 * value.actedOn) / value.found : null} />
      </TableCell>
    </>
  );
}
