import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from 'cn';
import { WARNING_INK } from '../lib/format.ts';
import { Button } from './ui/button.tsx';

/** How long a copy shows as done. */
const COPIED_MS = 2000;

/**
 * A button that copies `text`: "Copy", or with a `label` an icon-only one of that name, kept beside its `children`. For
 * a moment after a copy its icon is a check and its word "Copied", which is announced too; a failed one says so in fixed
 * words until the next try, on a line before "Copy" or after the icon, so a row's buttons stay put.
 */
export function CopyButton({ text, label, children }: { text: string; label?: string; children?: ReactNode }) {
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
  const line = (
    <span aria-live="polite" className={failed ? cn(WARNING_INK, label ? 'text-xs' : 'self-center text-sm') : 'sr-only'}>
      {copied && 'Copied'}
      {failed && "Couldn't copy it. Try again."}
    </span>
  );
  const button = (
    <Button variant={label ? 'ghost' : 'outline'} size={label ? 'icon-xs' : 'default'} aria-label={label} onClick={copy}>
      <Icon aria-hidden />
      {!label && (copied ? 'Copied' : 'Copy')}
    </Button>
  );
  return label ? (
    <>
      <span className="inline-flex items-center gap-0.5 align-baseline">
        {children}
        {button}
      </span>
      {failed && ' '}
      {line}
    </>
  ) : (
    <>
      {line}
      {button}
    </>
  );
}
