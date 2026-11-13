import { useMemo, useState } from 'react';
import { useInbox } from '../../hooks/useInbox';
import type { LiveTable } from '../../hooks/useLiveTable';
import { INBOX_STATUSES, dayOf, sortInbox, statusOf, type InboxRow, type InboxStatus } from '../../lib/inbox';
import { plural, timeAgo } from '../../lib/format';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, SkeletonCards, Tag } from '../common';
import { IconBot, IconUser } from '../Icons';
import './inbox.css';

type Filter = 'all' | InboxStatus;

interface InboxPageProps {
  userId: string;
  now: number;
}

function Row({ row, now, index }: { row: InboxRow; now: number; index: number }) {
  const status = statusOf(row.status);
  return (
    <li className={`inboxrow ${index % 2 === 0 ? 'is-striped' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}>
      <CompanyLogo name={row.company} size={34} />
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
        <Tag color={status.color} className="tag--status">
          <span className="tag__dot" aria-hidden="true" />
          {status.label}
        </Tag>
        <span className="inboxrow__when num" title={`Applied ${dayOf(row.applied_at)}, ${plural(row.mails, 'mail')}`}>
          {timeAgo(row.updated_at, now)}
        </span>
        <span className={`inboxrow__by ${row.by_agent ? 'is-agent' : ''}`} title={row.by_agent ? 'Sent by the agent' : 'Sent by you'}>
          {row.by_agent ? <IconBot size={14} /> : <IconUser size={14} />}
          <span>{row.by_agent ? 'Agent' : 'You'}</span>
        </span>
      </div>
    </li>
  );
}

/** The page's content for a table of inbox rows, so the preview can feed it mock data. */
export function InboxView({ table, now }: { table: LiveTable<InboxRow>; now: number }) {
  const { rows, loading, error, reload } = table;
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
      <div className="card">
        <EmptyState
          wolf="thinking"
          title={error.kind === 'missing-table' ? 'Inbox not set up yet' : 'Could not load the inbox'}
          text={error.kind === 'missing-table' ? 'Run supabase/schema.sql on the project once, then start the agent.' : error.message}
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={reload}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="card listcard">
        <SkeletonCards count={6} check={false} zebra />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          wolf="reading"
          title="No mail read yet"
          text="Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env on your computer and start the agent. It reads your Gmail read-only and lists here where each application stands."
        />
      </div>
    );
  }
  return (
    <section className="inbox page" aria-label="Applications read from your mail">
      <div className="inbox__bar">
        <PillGroup label="Status" options={options} value={active} onChange={setFilter} />
        {synced ? <span className="inbox__synced num">Mail read {timeAgo(synced, now)}</span> : null}
      </div>
      <div className="card listcard">
        <ul className="inbox__list">
          {shown.map((row, i) => (
            <Row key={row.id} row={row} now={now} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Where each application stands, read from the person's own mail by the agent on their computer. */
export function InboxPage({ userId, now }: InboxPageProps) {
  const table = useInbox(userId);
  return <InboxView table={table} now={now} />;
}

export default InboxPage;
