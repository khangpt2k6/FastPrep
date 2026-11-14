// The Inbox, read like Gmail: a list of applications on the left with the newest mail of each, and the opened one's
// thread on the right. The agent on the person's computer reads their mail (read only) and keeps a short preview of
// each message; the page never sees full bodies.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fetchInboxMessages, useInbox, useInboxThread } from '../../hooks/useInbox';
import type { LiveTable } from '../../hooks/useLiveTable';
import { INBOX_STATUSES, latestOf, searchText, senderOf, statusOf, type InboxMessage, type InboxRow, type InboxStatus } from '../../lib/inbox';
import { plural, timeAgo } from '../../lib/format';
import { SPRING } from '../../lib/motion';
import { companyLookup } from '../../lib/overview';
import { tampaDate, tampaDayKey, tampaFormat, tampaParts, tampaTime } from '../../lib/time';
import type { JobRow } from '../../lib/types';
import { CompanyLogo } from '../CompanyLogo';
import { Friend } from '../mascot/Friend';
import { EmptyState, PillGroup, SkeletonCards, Tag } from '../common';
import { IconArrowLeft, IconBot, IconLink, IconMail, IconSearch, IconStar, IconUser, IconX } from '../Icons';
import { PillSelect } from '../settings';
import './inbox.css';

type Filter = 'all' | InboxStatus;
type Who = 'all' | 'agent' | 'me';
type Range = 0 | 7 | 30 | 90;
type Sort = 'new' | 'old';

const DAY = 86_400_000;
const READ_KEY = 'inbox-read';
const STAR_KEY = 'inbox-starred';

type Lookup = ReturnType<typeof companyLookup>;

/** A small map kept in this browser (read marks, stars). It works without storage too, for this visit only. */
function useStored<T>(key: string, fallback: T): [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<{ v: T; had: boolean }>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? { v: JSON.parse(raw) as T, had: true } : { v: fallback, had: false };
    } catch {
      return { v: fallback, had: false };
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue({ v: next, had: true });
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private windows keep it for this visit.
      }
    },
    [key],
  );
  return [value.v, set, value.had];
}

/** "10:42 AM" today, "Nov 3" this year, "Nov 3, 2025" before. */
function listDate(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  if (tampaDayKey(t) === tampaDayKey(now)) return tampaTime(t);
  return tampaDate(t, now);
}

/** "Thu, Nov 12, 9:41 AM (2h ago)" for a mail. */
function mailDate(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sameYear = tampaParts(t).year === tampaParts(now).year;
  const day = tampaFormat(sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(t);
  return `${day}, ${tampaTime(t)} (${timeAgo(iso, now)})`;
}

/** The company as the rest of the app shows it: the row's own domain first, then the jobs, then the name map. */
function companyOf(row: InboxRow, lookup: Lookup) {
  const hit = lookup(row.company);
  return { name: hit?.name ?? row.company, domain: row.domain || hit?.domain || '' };
}

function StatusTag({ status }: { status: string }) {
  const s = statusOf(status);
  return (
    <Tag color={s.color} className="tag--status">
      <span className="tag__dot" aria-hidden="true" />
      {s.label}
    </Tag>
  );
}

function ListRow({ row, now, lookup, selected, unread, starred, index, onOpen, onStar }: {
  row: InboxRow;
  now: number;
  lookup: Lookup;
  selected: boolean;
  unread: boolean;
  starred: boolean;
  index: number;
  onOpen: () => void;
  onStar: () => void;
}) {
  const { name, domain } = companyOf(row, lookup);
  const latest = latestOf(row);
  const snippet = latest?.snippet?.replace(/\s+/g, ' ').trim() ?? '';
  return (
    <li className={`mrow ${unread ? 'is-unread' : ''} ${selected ? 'is-selected' : ''}`} style={{ '--i': Math.min(index, 12) } as CSSProperties} data-id={row.id}>
      {selected ? <motion.span className="mrow__sel" layoutId="inbox-selection" transition={SPRING} aria-hidden="true" /> : null}
      <button type="button" className="mrow__hit" onClick={onOpen} aria-current={selected ? 'true' : undefined} aria-label={`${name}, ${row.role || 'application'}, ${statusOf(row.status).label}${unread ? ', unread' : ''}`}>
        <span className="mrow__dot" aria-hidden="true" />
        <CompanyLogo name={name} domain={domain} size={34} className="mrow__logo" />
        <span className="mrow__body" aria-hidden="true">
          <span className="mrow__top">
            <span className="mrow__company">{name}</span>
            {row.mails > 1 ? <span className="mrow__count num">{row.mails}</span> : null}
            <time className="mrow__date num" dateTime={row.updated_at}>
              {listDate(row.updated_at, now)}
            </time>
          </span>
          {row.role ? <span className="mrow__role">{row.role}</span> : null}
          <span className="mrow__line">
            <span className="mrow__subject">{latest?.subject || row.subject}</span>
            {snippet ? <span className="mrow__snippet">{snippet}</span> : null}
          </span>
          <span className="mrow__foot">
            <StatusTag status={row.status} />
            <span className={`mrow__by ${row.by_agent ? 'is-agent' : ''}`}>
              {row.by_agent ? <IconBot size={13} /> : <IconUser size={13} />}
              {row.by_agent ? 'Agent' : 'You'}
            </span>
          </span>
        </span>
      </button>
      <button type="button" className={`icon-btn icon-btn--sm mrow__star ${starred ? 'is-on' : ''}`} onClick={onStar} aria-pressed={starred} aria-label={starred ? `Unstar ${name}` : `Star ${name}`}>
        <IconStar size={14} fill={starred ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}

/** The mail itself in Gmail, in a new tab. */
function GmailLink({ url, small = true }: { url: string; small?: boolean }) {
  return (
    <a className={`btn btn--secondary ${small ? 'btn--xs' : 'btn--sm'} gmaillink`} href={url} target="_blank" rel="noopener noreferrer">
      <IconLink size={13} />
      Open in Gmail
    </a>
  );
}

/** One mail in the thread: the newest is open, older ones show their sender and first line until clicked. */
function Message({ m, now, open, onToggle }: { m: InboxMessage; now: number; open: boolean; onToggle: () => void }) {
  const who = senderOf(m);
  const first = m.snippet.replace(/\s+/g, ' ').trim();
  return (
    <li className={`mmsg ${open ? 'is-open' : ''}`}>
      <button type="button" className="mmsg__head" aria-expanded={open} onClick={onToggle}>
        <span className="mmsg__avatar" aria-hidden="true">
          {(who.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase()}
        </span>
        <span className="mmsg__who">
          <span className="mmsg__name">{who}</span>
          {m.from_name && m.from_address ? <span className="mmsg__addr">{m.from_address}</span> : null}
          {!open && first ? <span className="mmsg__first">{first}</span> : null}
        </span>
        <time className="mmsg__time num" dateTime={m.at}>
          {open ? mailDate(m.at, now) : listDate(m.at, now)}
        </time>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="mmsg__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
          >
            <div className="mmsg__inner">
              <p className="mmsg__subject">{m.subject}</p>
              {m.snippet ? <p className="mmsg__snippet">{m.snippet}</p> : <p className="mmsg__snippet muted">No text kept for this mail.</p>}
              <div className="mmsg__foot">
                <StatusTag status={m.status} />
                {m.gmail_url ? <GmailLink url={m.gmail_url} /> : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function Pane({ row, now, lookup, starred, onStar, onUnread, onClose, load }: {
  row: InboxRow | null;
  now: number;
  lookup: Lookup;
  starred: boolean;
  onStar: () => void;
  onUnread: () => void;
  onClose: () => void;
  load: (row: InboxRow) => Promise<InboxMessage[]>;
}) {
  const thread = useInboxThread(row, load);
  // Oldest first, as a conversation reads; the newest starts open.
  const ordered = useMemo(() => [...thread.messages].reverse(), [thread.messages]);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  useEffect(() => setOpened(new Set([ordered.length - 1])), [row?.id, ordered.length]);

  if (!row) {
    return (
      <div className="mpane mpane--empty">
        <Friend name="bunny-thinking" size={88} />
        <p className="mpane__hint">Select an application</p>
        <p className="mpane__keys">
          <kbd>j</kbd> <kbd>k</kbd> to move, <kbd>Enter</kbd> to open, <kbd>/</kbd> to search
        </p>
      </div>
    );
  }
  const { name, domain } = companyOf(row, lookup);
  const applied = Date.parse(row.applied_at);
  const appliedText = Number.isFinite(applied)
    ? `${row.applied_known === false ? 'Applied about ' : 'Applied '}${tampaFormat({ month: 'short', day: 'numeric', year: 'numeric' }).format(applied)}`
    : '';
  return (
    <section className="mpane" aria-label={`Mail from ${name}`}>
      <header className="mpane__head">
        <button type="button" className="icon-btn mpane__back" onClick={onClose} aria-label="Back to the list">
          <IconArrowLeft size={18} />
        </button>
        <CompanyLogo name={name} domain={domain} size={44} />
        <div className="mpane__title">
          <h2 className="mpane__company">{name}</h2>
          {row.role ? <p className="mpane__role">{row.role}</p> : null}
          <p className="mpane__meta num">
            <StatusTag status={row.status} />
            {appliedText ? <span title={row.applied_known === false ? 'No receipt found: the date of the first mail' : undefined}>{appliedText}</span> : null}
            <span>{plural(row.mails, 'mail')}</span>
            <span className="mpane__by">
              {row.by_agent ? <IconBot size={13} /> : <IconUser size={13} />}
              {row.by_agent ? 'Sent by the agent' : 'Sent by you'}
            </span>
          </p>
        </div>
        <div className="mpane__actions">
          {thread.messages[0]?.gmail_url ? <GmailLink url={thread.messages[0].gmail_url} small={false} /> : null}
          <button type="button" className={`icon-btn ${starred ? 'is-on' : ''}`} onClick={onStar} aria-pressed={starred} aria-label={starred ? 'Unstar' : 'Star'} title={starred ? 'Starred (s)' : 'Star (s)'}>
            <IconStar size={16} fill={starred ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="icon-btn" onClick={onUnread} aria-label="Mark as unread" title="Mark as unread (u)">
            <IconMail size={16} />
          </button>
        </div>
      </header>
      {thread.loading ? (
        <div className="mthread__skel" aria-busy="true" aria-label="Loading the mail">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="mthread__none">
          <p className="mmsg__subject">{row.subject}</p>
          <p className="muted">The agent has not kept the text of these mails yet. It does from its next mail check.</p>
        </div>
      ) : (
        <ol className="mthread">
          {ordered.map((m, i) => (
            <Message
              key={`${m.at}-${i}`}
              m={m}
              now={now}
              open={opened.has(i)}
              onToggle={() =>
                setOpened((set) => {
                  const next = new Set(set);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}

const NO_JOBS: JobRow[] = [];

/** The page's content for a table of inbox rows, so the preview can feed it mock data. */
export function InboxView({ table, now, jobs = NO_JOBS, loadThread = fetchInboxMessages }: {
  table: LiveTable<InboxRow>;
  now: number;
  jobs?: JobRow[];
  /** How to get one application's mails; the preview passes its own. */
  loadThread?: (row: InboxRow) => Promise<InboxMessage[]>;
}) {
  const { rows, loading, error, reload } = table;
  const lookup = useMemo(() => companyLookup(jobs), [jobs]);
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = useState<Who>('all');
  const [range, setRange] = useState<Range>(0);
  const [sort, setSort] = useState<Sort>('new');
  const [query, setQuery] = useState('');
  const [starOnly, setStarOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [readMap, setReadMap, hadRead] = useStored<Record<string, string>>(READ_KEY, {});
  const [starList, setStarList] = useStored<string[]>(STAR_KEY, []);
  const starred = useMemo(() => new Set(starList), [starList]);
  const search = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The first visit marks everything there as read, so only new mail stands out from then on.
  useEffect(() => {
    if (hadRead || loading || rows.length === 0) return;
    setReadMap(Object.fromEntries(rows.map((r) => [r.id, r.updated_at])));
  }, [hadRead, loading, rows, setReadMap]);

  const isUnread = (row: InboxRow) => hadRead && readMap[row.id] !== row.updated_at;

  const counts = useMemo(() => {
    const found = new Map<string, number>();
    for (const row of rows) found.set(row.status, (found.get(row.status) ?? 0) + 1);
    return found;
  }, [rows]);
  const options = useMemo(
    () => [
      { value: 'all' as Filter, label: 'All', count: rows.length },
      ...INBOX_STATUSES.filter((entry) => counts.has(entry.status)).map((entry) => ({ value: entry.status as Filter, label: entry.many, count: counts.get(entry.status) })),
    ],
    [rows.length, counts],
  );
  // A filter whose last row went away falls back to All instead of showing an empty list.
  const active = filter !== 'all' && !counts.has(filter) ? 'all' : filter;
  const minute = Math.floor(now / 60000);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = range ? minute * 60000 - range * DAY : 0;
    const list = rows.filter(
      (row) =>
        (active === 'all' || row.status === active) &&
        (who === 'all' || (who === 'agent' ? row.by_agent : !row.by_agent)) &&
        (!since || Date.parse(row.updated_at) >= since) &&
        (!starOnly || starred.has(row.id)) &&
        (!q || searchText(row).includes(q)),
    );
    return list.sort((a, b) => (sort === 'new' ? b.updated_at.localeCompare(a.updated_at) : a.updated_at.localeCompare(b.updated_at)));
  }, [rows, active, who, range, sort, query, starOnly, starred, minute]);
  const synced = rows.reduce((latest, row) => (row.synced_at > latest ? row.synced_at : latest), '');
  const selected = shown.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null;
  const filtered = active !== 'all' || who !== 'all' || range !== 0 || starOnly || query.trim() !== '';

  const markRead = useCallback((row: InboxRow) => setReadMap({ ...readMap, [row.id]: row.updated_at }), [readMap, setReadMap]);
  const open = useCallback(
    (row: InboxRow) => {
      setSelectedId(row.id);
      setPaneOpen(true);
      markRead(row);
    },
    [markRead],
  );
  const toggleStar = useCallback((id: string) => setStarList(starred.has(id) ? starList.filter((s) => s !== id) : [...starList, id]), [starred, starList, setStarList]);
  const markUnread = useCallback(
    (row: InboxRow) => {
      const next = { ...readMap };
      delete next[row.id];
      setReadMap(next);
    },
    [readMap, setReadMap],
  );

  // A row that came into view by the keyboard is scrolled to.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // j and k move, Enter opens, Esc closes, / searches, s stars, u marks unread: Gmail's keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing) {
        if (event.key === 'Escape' && target === search.current) search.current?.blur();
        return;
      }
      if (document.querySelector('.overlay')) return;
      const index = shown.findIndex((r) => r.id === selectedId);
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const next = shown[Math.max(0, Math.min(shown.length - 1, index + (event.key === 'j' ? 1 : -1)))] ?? shown[0];
        if (next) {
          setSelectedId(next.id);
          markRead(next);
        }
      } else if (event.key === 'Enter' && selected) {
        event.preventDefault();
        open(selected);
      } else if (event.key === 'Escape') {
        if (paneOpen) setPaneOpen(false);
        else setSelectedId(null);
      } else if (event.key === '/') {
        event.preventDefault();
        search.current?.focus();
      } else if (event.key === 's' && selected) {
        toggleStar(selected.id);
      } else if (event.key === 'u' && selected) {
        markUnread(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, selectedId, selected, paneOpen, open, markRead, toggleStar, markUnread]);

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
        <SkeletonCards count={6} check={false} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          friend="bunny-reading"
          title="No mail read yet"
          text="Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env, then start the agent."
        />
      </div>
    );
  }

  const clear = () => {
    setFilter('all');
    setWho('all');
    setRange(0);
    setStarOnly(false);
    setQuery('');
  };

  return (
    <section className="inbox page" aria-label="Applications read from your mail">
      <PillGroup label="Status" options={options} value={active} onChange={setFilter} />
      <div className="inbox__bar">
        <label className="inbox__search">
          <IconSearch size={15} />
          <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mail" aria-label="Search by company, role, subject or sender" />
          {query ? (
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setQuery('')} aria-label="Clear search">
              <IconX size={13} />
            </button>
          ) : null}
        </label>
        <PillGroup<Who>
          label="Sent by"
          value={who}
          onChange={setWho}
          options={[
            { value: 'all', label: 'Anyone' },
            { value: 'agent', label: 'By agent' },
            { value: 'me', label: 'By me' },
          ]}
        />
        <PillSelect<Range>
          label="Last mail"
          value={range}
          onChange={setRange}
          options={[
            { value: 0, label: 'Any time' },
            { value: 7, label: 'Last 7 days' },
            { value: 30, label: 'Last 30 days' },
            { value: 90, label: 'Last 90 days' },
          ]}
        />
        <PillSelect<Sort>
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'new', label: 'Newest first' },
            { value: 'old', label: 'Oldest first' },
          ]}
        />
        <button type="button" className={`icon-btn inbox__starred ${starOnly ? 'is-on' : ''}`} aria-pressed={starOnly} onClick={() => setStarOnly((v) => !v)} aria-label="Starred only" title="Starred only">
          <IconStar size={16} fill={starOnly ? 'currentColor' : 'none'} />
        </button>
        {synced ? <span className="inbox__synced num">Mail read {timeAgo(synced, now)}</span> : null}
      </div>

      <div className={`mail ${paneOpen && selected ? 'is-reading' : ''}`}>
        <div className="mail__list card">
          {shown.length === 0 ? (
            <div className="mail__none">
              <p>No mail matches.</p>
              {filtered ? (
                <button type="button" className="btn btn--secondary btn--sm" onClick={clear}>
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="mail__rows" ref={listRef} aria-label="Applications">
              {shown.map((row, i) => (
                <ListRow
                  key={row.id}
                  row={row}
                  now={now}
                  lookup={lookup}
                  index={i}
                  selected={row.id === selectedId}
                  unread={isUnread(row)}
                  starred={starred.has(row.id)}
                  onOpen={() => open(row)}
                  onStar={() => toggleStar(row.id)}
                />
              ))}
            </ul>
          )}
          <p className="mail__keys" aria-hidden="true">
            <kbd>j</kbd>
            <kbd>k</kbd> move <kbd>Enter</kbd> open <kbd>s</kbd> star <kbd>u</kbd> unread
          </p>
        </div>
        <div className="mail__pane card">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected?.id ?? 'none'}
              className="mail__panefx"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <Pane
                row={selected}
                now={now}
                lookup={lookup}
                starred={selected ? starred.has(selected.id) : false}
                onStar={() => selected && toggleStar(selected.id)}
                onUnread={() => {
                  if (!selected) return;
                  markUnread(selected);
                  setPaneOpen(false);
                }}
                onClose={() => setPaneOpen(false)}
                load={loadThread}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/** Where each application stands, read from the person's own mail by the agent on their computer. */
export function InboxPage({ userId, now, jobs }: { userId: string; now: number; jobs?: JobRow[] }) {
  const table = useInbox(userId);
  return <InboxView table={table} now={now} jobs={jobs} />;
}

export default InboxPage;
