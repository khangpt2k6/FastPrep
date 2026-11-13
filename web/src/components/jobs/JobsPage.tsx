import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import type { JobRow, LoadError } from '../../lib/types';
import type { CompanyCount, MinScore, SortKey, Track } from '../../lib/jobs';
import { CheckBox, EmptyState, SkeletonCards } from '../common';
import { IconRadar } from '../Icons';
import { Shimmer, StateFade } from '../motion';
import { JobCard } from './JobCard';
import { CompanyBar, RoleChips } from './ChipRows';
import { ListToolbar } from './ListToolbar';
import { TrackPills } from './TrackPills';

export type { MinScore };

export interface JobFilterState {
  query: string;
  minScore: MinScore;
  track: Track;
  role: string | null;
  company: string | null;
  sort: SortKey;
}

interface JobsPageProps {
  /** Scored jobs that can still be applied to, before any filter. */
  candidates: JobRow[];
  /** After every filter, in the chosen order. */
  visible: JobRow[];
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  selected: Set<string>;
  queued: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  saved: Set<string>;
  onSave: (id: string) => void;
  filters: JobFilterState;
  onFilters: (patch: Partial<JobFilterState>) => void;
  onClearFilters: () => void;
  kinds: { name: string; count: number }[];
  companies: CompanyCount[];
  trackCounts: Record<Track, number>;
  /** A search is on its way or running: the button shimmers "Finding jobs". */
  searching: boolean;
  onSearch: () => void;
  now: number;
  scored: number;
  found: number;
  /** The gradient cards on top. */
  banner?: ReactNode;
  /** Callouts above the list: agent offline, Live mode, profile incomplete. */
  notices?: ReactNode;
  actionBar: ReactNode;
  /** The right column: calendar, progress, the agent. */
  rail?: ReactNode;
}

function SelectAll({ ids, selected, onToggleAll }: { ids: string[]; selected: Set<string>; onToggleAll: JobsPageProps['onToggleAll'] }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <label className="check" title={all ? 'Clear selection' : 'Select all'}>
      <input ref={ref} type="checkbox" checked={all} disabled={ids.length === 0} onChange={() => onToggleAll(ids, !all)} aria-label="Select all jobs shown" />
      <CheckBox />
    </label>
  );
}

/** "Find more", or a shimmering "Finding jobs" while a search runs. */
export function FindButton({ searching, onSearch, small = false }: { searching: boolean; onSearch: () => void; small?: boolean }) {
  return (
    <button type="button" className={`btn btn--primary ${small ? 'btn--sm' : ''} findbtn`} onClick={onSearch} disabled={searching} title="Ask the agent for more jobs">
      <IconRadar size={15} className={searching ? 'spin-slow' : ''} />
      {searching ? <Shimmer tone="inverse">Finding jobs</Shimmer> : 'Find more'}
    </button>
  );
}

export function JobsPage(props: JobsPageProps) {
  const { candidates, visible, loading, error, selected, queued, filters, now } = props;
  const selectable = visible.filter((j) => !queued.has(j.id)).map((j) => j.id);
  const set = props.onFilters;

  let body: ReactNode;
  let state = 'list';
  if (error) {
    state = 'error';
    body = (
      <EmptyState
        wolf="thinking"
        title="Could not load jobs"
        text={error.message}
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onRetry}>
            Retry
          </button>
        }
      />
    );
  } else if (loading) {
    state = 'loading';
    body = <SkeletonCards count={8} check zebra />;
  } else if (candidates.length === 0) {
    state = 'none';
    body = (
      <EmptyState
        wolf="music"
        title="No scored jobs yet"
        text={props.searching ? <Shimmer>The agent is looking now.</Shimmer> : 'Ask the agent to look for some.'}
        action={<FindButton searching={props.searching} onSearch={props.onSearch} />}
      />
    );
  } else if (visible.length === 0) {
    state = 'filtered';
    body = (
      <EmptyState
        wolf="thinking"
        title="No matches"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onClearFilters}>
            Clear filters
          </button>
        }
      />
    );
  } else {
    body = (
      <>
        <div className="jhead" aria-hidden="true">
          <span />
          <span />
          <span>Job</span>
          <span className="jhead__loc">Place</span>
          <span className="jhead__time">Found</span>
          <span className="jhead__score">Match</span>
        </div>
        <ul className="jlist">
          <AnimatePresence mode="popLayout">
            {visible.map((job, i) => (
              <JobCard
                key={job.id}
                index={i}
                job={job}
                now={now}
                selected={selected.has(job.id)}
                queued={queued.has(job.id)}
                saved={props.saved.has(job.id)}
                onToggle={props.onToggle}
                onSave={props.onSave}
              />
            ))}
          </AnimatePresence>
        </ul>
      </>
    );
  }

  return (
    <div className="home">
      <div className="home__main page">
        {props.notices}
        {props.banner}
        <RoleChips kinds={props.kinds} active={filters.role} onPick={(role) => set({ role })} />
        <CompanyBar companies={props.companies} active={filters.company} onPick={(company) => set({ company })} />
        <TrackPills active={filters.track} counts={props.trackCounts} onPick={(track) => set({ track })} />
        <section className="card listcard" aria-label="Jobs">
          <div className="listcard__top">
            {visible.length > 0 && !loading && !error ? <SelectAll ids={selectable} selected={selected} onToggleAll={props.onToggleAll} /> : null}
            <ListToolbar
              query={filters.query}
              onQuery={(query) => set({ query })}
              sort={filters.sort}
              onSort={(sort) => set({ sort })}
              minScore={filters.minScore}
              onMinScore={(minScore) => set({ minScore })}
              shown={visible.length}
              total={candidates.length}
              scored={props.scored}
              found={props.found}
              action={<FindButton searching={props.searching} onSearch={props.onSearch} small />}
            />
          </div>
          <StateFade state={state}>{body}</StateFade>
        </section>
        {props.actionBar}
      </div>
      {props.rail ? <aside className="home__rail">{props.rail}</aside> : null}
    </div>
  );
}
