import type { ReactNode } from 'react';
import type { Estimates } from '@cwd/shared';
import { Unknown } from '../components/Num.tsx';
import { formatUsagePercent, plural } from '../lib/format.ts';

/** A usage sum on the backdrop: the dash when none is known. */
export function backdropUsage(value: number | null): ReactNode {
  return value === null ? <Unknown backdrop /> : formatUsagePercent(value);
}

/** A change's or goal's usage facts on the backdrop: its all-models and Fable sums, then the units it left out, left
 * out at 0. */
export function estimateFacts(estimates: Estimates): [string, ReactNode][] {
  return [
    ['All-models usage', backdropUsage(estimates.all)],
    ['Fable usage', backdropUsage(estimates.fable)],
    ...(estimates.notEstimated > 0
      ? [['Not estimated', plural(estimates.notEstimated, 'unit')] as [string, ReactNode]]
      : []),
  ];
}
