import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import type { JobRow, LoadError } from '../../lib/types';
import { SORT_LABEL, type MinScore, type SortKey } from '../../lib/jobs';
import { CheckBox, EmptyState, PillGroup, SkeletonCards } from '../common';
import { IconRadar, IconSearch, IconStar, IconX } from '../Icons';
import { Shimmer, StateFade } from '../motion';
import { PillSelect } from '../settings';
import { JobCard } from './JobCard';
import './jobs.css';

export type { MinScore };

export interface JobFilterState {
  query: string;
  minScore: MinScore;
  sort: SortKey;
  /** Only jobs found in the last 24 hours. */
  newOnly: boolean;
  /** Only starred jobs. */
  savedOnly: boolean;
  /** A company key from the Companies page ("See jobs"), kept in the route. */
  company: string | null;
}

export const NO_JOB_FILTERS: Omit<JobFilterState, 'company'> = { query: '', minScore: 0, sort: 'score', newOnly: false, savedOnly: false };

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
  /** The filtered company's display name, for its tag. */
  companyLabel?: string;
  /** A search is on its way or running: the button shimmers "Finding jobs". */
  searching: boolean;
  onSearch: () => void;
  now: number;
  /** Callouts above the list: agent offline, Live mode, profile incomplete. */
  notices?: ReactNode;
  actionBar: ReactNode;
}

function SelectAll({ ids, selected, onToggleAll }: { ids: string[]; selected: Set<string>; onToggleAll: JobsPageProps['onToggleAll'] }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <label className="check jtool__all" title={all ? 'Clear selection' : 'Select all shown'}>
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

/** A small switch with its words, for the toolbar. */
function ToolSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={`jtool__switch ${checked ? 'is-on' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch switch--sm" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function JobsPage(props: JobsPageProps) {
  const { candidates, visible, loading, error, selected, queued, filters, now } = props;
  const selectable = visible.filter((j) => !queued.has(j.id)).map((j) => j.id);
  const set = props.onFilters;
  const filtered = filters.query !== '' || filters.minScore !== 0 || filters.newOnly || filters.savedOnly || Boolean(filters.company);

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
    body = <SkeletonCards count={8} check />;
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
        title="No jobs match these filters"
        text="Try a lower score or clear the search."
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onClearFilters}>
            Clear filters
          </button>
        }
      />
    );
  } else {
    body = (
      <ul className="jlist">
        <AnimatePresence mode="popLayout" initial={false}>
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
    );
  }

  return (
    <div className="jobs page">
      {props.notices}
      <section className="card jcard" aria-label="Jobs">
        <div className="jtool" role="toolbar" aria-label="Filter and sort jobs">
          {visible.length > 0 && !loading && !error ? <SelectAll ids={selectable} selected={selected} onToggleAll={props.onToggleAll} /> : null}
          <label className="jsearch">
            <IconSearch size={15} />
            <input type="search" value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder="Search jobs" aria-label="Search jobs by title, company or place" />
            {filters.query ? (
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => set({ query: '' })} aria-label="Clear search">
                <IconX size={13} />
              </button>
            ) : null}
          </label>
          {filters.company ? (
            <span className="jtool__company">
              <span className="jtool__companyname">{props.companyLabel || filters.company}</span>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => set({ company: null })} aria-label={`Show every company, not only ${props.companyLabel || filters.company}`}>
                <IconX size={12} />
              </button>
            </span>
          ) : null}
          <PillGroup<MinScore>
            label="Match score"
            value={filters.minScore}
            onChange={(minScore) => set({ minScore })}
            options={[
              { value: 0, label: 'Any', title: 'Any score' },
              { value: 3, label: '3+', title: 'Score 3 and up' },
              { value: 4, label: '4+', title: 'Strong matches, 4 and up' },
            ]}
          />
          <PillSelect<SortKey>
            label="Sort"
            value={filters.sort}
            onChange={(sort) => set({ sort })}
            options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))}
          />
          <ToolSwitch checked={filters.newOnly} onChange={(newOnly) => set({ newOnly })} label="New only" />
          <button
            type="button"
            className={`icon-btn jtool__saved ${filters.savedOnly ? 'is-on' : ''}`}
            aria-pressed={filters.savedOnly}
            onClick={() => set({ savedOnly: !filters.savedOnly })}
            aria-label="Saved only"
            title={filters.savedOnly ? 'Showing saved jobs' : 'Show saved jobs only'}
          >
            <IconStar size={16} fill={filters.savedOnly ? 'currentColor' : 'none'} />
          </button>
          {/* The count sits beside the page title; screen readers hear it change here. */}
          <span className="sr-only" aria-live="polite">
            {loading ? '' : filtered ? `${visible.length} of ${candidates.length} jobs shown` : `${candidates.length} jobs`}
          </span>
          <FindButton searching={props.searching} onSearch={props.onSearch} small />
        </div>
        <StateFade state={state}>{body}</StateFade>
      </section>
      {props.actionBar}
    </div>
  );
}
