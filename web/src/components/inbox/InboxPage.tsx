import { useMemo, useState } from 'react';
import { useInbox } from '../../hooks/useInbox';
import { INBOX_STATUSES, dayOf, sortInbox, statusOf, type InboxRow, type InboxStatus } from '../../lib/inbox';
import { initialOf, monogramColors, plural, timeAgo } from '../../lib/format';
import { EmptyState, PillGroup, SkeletonCards, Tag } from '../common';
import { IconAlert, IconSend } from '../Icons';
import './inbox.css';

type Filter = 'all' | InboxStatus;

interface InboxPageProps {
  userId: string;
  now: number;
}

function Row({ row, now }: { row: InboxRow; now: number }) {
  const status = statusOf(row.status);
  return (
    <li className="inboxrow">
      <span className="inboxrow__mark" style={monogramColors(row.company)} aria-hidden="true">
        {initialOf(row.company)}
      </span>
      <div className="inboxrow__main">
        <p className="inboxrow__title">
          <span className="inboxrow__company">{row.company}</span>
          {row.role ? <span className="inboxrow__role">{row.role}</span> : null}
        </p>
        <p className="inboxrow__sub" title={row.subject}>
          {row.subject}
        </p>
      </div>
      <div className="inboxrow__meta">
        <Tag color={status.color}>{status.label}</Tag>
        <span className="inboxrow__when" title={`Applied ${dayOf(row.applied_at)}, ${row.mails} ${plural(row.mails, 'mail')}`}>
          {timeAgo(row.updated_at, now)}
        </span>
        <span className="inboxrow__by">{row.by_agent ? 'Sent by the agent' : 'Sent by you'}</span>
      </div>
    </li>
  );
}

/** Where each application stands, read from the person's own mail by the agent on their computer. */
export function InboxPage({ userId, now }: InboxPageProps) {
  const { rows, loading, error, reload } = useInbox(userId);
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = useMemo(() => sortInbox(rows), [rows]);
  const counts = useMemo(() => {
    const found = new Map<string, number>();
    for (const row of rows) found.set(row.status, (found.get(row.status) ?? 0) + 1);
    return found;
  }, [rows]);
  const options = useMemo(
    () => [
      { value: 'all' as Filter, label: 'All', count: rows.length },
      ...INBOX_STATUSES.filter((entry) => counts.has(entry.status)).map((entry) => ({
        value: entry.status as Filter,
        label: entry.many,
        count: counts.get(entry.status),
      })),
    ],
    [rows.length, counts],
  );
  // A filter whose last row went away falls back to All instead of showing an empty list.
  const active = filter !== 'all' && !counts.has(filter) ? 'all' : filter;
  const shown = active === 'all' ? sorted : sorted.filter((row) => row.status === active);
  const synced = rows.reduce((latest, row) => (row.synced_at > latest ? row.synced_at : latest), '');

  if (error) {
    return (
      <EmptyState
        icon={<IconAlert size={22} />}
        title={error.kind === 'missing-table' ? 'The inbox table is not set up yet' : 'Could not load the inbox'}
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={reload}>
            Try again
          </button>
        }
      >
        {error.kind === 'missing-table' ? 'Run supabase/schema.sql on the project once, then start the agent.' : error.message}
      </EmptyState>
    );
  }
  if (loading) return <SkeletonCards count={5} />;
  if (rows.length === 0) {
    return (
      <EmptyState icon={<IconSend size={22} />} title="No applications read from your mail yet">
        Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env on your computer and start the agent. It reads your Gmail read-only and lists
        here where each application stands.
      </EmptyState>
    );
  }
  return (
    <section className="inbox" aria-label="Applications read from your mail">
      <div className="inbox__bar">
        <PillGroup label="Status" options={options} value={active} onChange={setFilter} />
        {synced ? <span className="inbox__synced">Mail read {timeAgo(synced, now)}</span> : null}
      </div>
      <ul className="inbox__list">
        {shown.map((row) => (
          <Row key={row.id} row={row} now={now} />
        ))}
      </ul>
    </section>
  );
}
