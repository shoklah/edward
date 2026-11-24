import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from 'cn';
import { WARNING_INK } from '../lib/format.ts';
import { Button } from './ui/button.tsx';

/** How long a copy shows as done. */
const COPIED_MS = 2000;

/**
 * A button that copies `text`: "Copy", or with a `label` an icon-only one of that name. For a moment after a copy its
 * icon is a check and its word "Copied", which is announced too; a failed one says so beside it, in fixed words, until
 * the next try. Its place is a row: the failure's line comes before "Copy" and after an icon, so neither moves.
 */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);
  const copied = outcome === 'copied';
  const failed = outcome === 'failed';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setOutcome(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    // So a second try shows and is announced as its own.
    setOutcome(null);
    try {
      await navigator.clipboard.writeText(text);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <>
      <span aria-live="polite" className={failed ? cn(WARNING_INK, label ? 'order-last text-xs' : 'self-center text-sm') : 'sr-only'}>
        {copied && 'Copied'}
        {failed && "Couldn't copy it. Try again."}
      </span>
      <Button variant={label ? 'ghost' : 'outline'} size={label ? 'icon-xs' : 'default'} aria-label={label} onClick={copy}>
        <Icon aria-hidden />
        {!label && (copied ? 'Copied' : 'Copy')}
      </Button>
    </>
  );
}
