import { cn } from 'cn';
import { CopyButton } from './CopyButton.tsx';
import { TERM } from './Panel.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.tsx';

/**
 * A session by its name, with its full ID in a tooltip on hover and focus and a button that copies it (decision 31).
 * The name is the ID's first 8 characters until the reporter gives sessions a title (CR9).
 */
export function SessionChip({ id, failureClassName }: { id: string; failureClassName?: string }) {
  return (
    <CopyButton key={id} text={id} label="Copy session ID" failureClassName={failureClassName}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('rounded tabular-nums', TERM)}>
            {id.slice(0, 8)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="font-mono">{id}</TooltipContent>
      </Tooltip>
    </CopyButton>
  );
}
