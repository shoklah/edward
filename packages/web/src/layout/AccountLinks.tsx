import { useRef } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { KeyRound, UserRound } from 'lucide-react';
import { useStatus } from '../api.ts';
import { cn } from 'cn';
import { CURRENT, ENTRY } from '../lib/format.ts';
import { usePill } from '../motion/index.ts';

/** Hosted mode's signed-in login, a link to the Account page, and for the admin Admin under it, a link to the Admin
 * page, both in the menu entry's look; nothing in local mode or while the status loads. `onNavigate` runs when it is followed; `className` is what a call site adds (the Menu dialog's
 * hairline). */
export function AccountLinks({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const account = useStatus().data?.account;
  const pathname = useLocation({ select: (location) => location.pathname });
  const nav = useRef<HTMLElement>(null);
  // Keyed by the account too: there is no nav until the status has come.
  usePill(nav, account ? pathname : '');
  if (!account) return null;
  return (
    <nav ref={nav} aria-label="Account" className={cn('isolate flex flex-col gap-1', className)}>
      <Link to="/account" onClick={onNavigate} className={ENTRY} activeProps={{ className: CURRENT }}>
        <UserRound className="size-4 flex-none" aria-hidden />
        {account.login}
      </Link>
      {account.admin && (
        <Link to="/admin" onClick={onNavigate} className={ENTRY} activeProps={{ className: CURRENT }}>
          <KeyRound className="size-4 flex-none" aria-hidden />
          Admin
        </Link>
      )}
    </nav>
  );
}
