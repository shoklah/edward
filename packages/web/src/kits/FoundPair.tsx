import type { Found } from '@cwd/shared';
import { NumCell, SubHeads } from '../components/Num.tsx';

/** Two severities' findings as one. */
export function together(a: Found, b: Found): Found {
  return { found: a.found + b.found, actedOn: a.actedOn + b.actedOn };
}

/** The pair's two sub-column headers, under their group's. */
export function FoundHeads() {
  return <SubHeads columns={['Found', 'Acted on (%)']} />;
}

/** The pair's two cells: the findings found, and the whole percent of them acted on, not known when none was found. */
export function FoundCells({ value }: { value: Found }) {
  return (
    <>
      <NumCell value={value.found} />
      <NumCell value={value.found ? (100 * value.actedOn) / value.found : null} />
    </>
  );
}
