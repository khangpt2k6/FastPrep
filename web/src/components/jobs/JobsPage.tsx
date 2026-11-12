import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import type { JobRow, LoadError } from '../../lib/types';
import { CheckBox, EmptyState, PillGroup, SkeletonCards } from '../common';
import { IconAlert, IconBriefcase, IconRadar, IconSearch } from '../Icons';
import { JobCard } from './JobCard';
import { AnimatedNumber, StateFade } from '../motion';

export type MinScore = 0 | 3 | 4;

interface JobsPageProps {
  candidates: JobRow[];
  visible: JobRow[];
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  selected: Set<string>;
  queued: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  minScore: MinScore;
  onMinScore: (value: MinScore) => void;
  query: string;
  onQuery: (value: string) => void;
  onClearFilters: () => void;
  searching: boolean;
  onSearch: () => void;
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
    <label className="check" title={all ? 'Clear selection' : 'Select all'}>
      <input ref={ref} type="checkbox" checked={all} disabled={ids.length === 0} onChange={() => onToggleAll(ids, !all)} aria-label="Select all jobs shown" />
      <CheckBox />
    </label>
  );
}

export function JobsPage(props: JobsPageProps) {
  const { candidates, visible, loading, error, selected, queued, minScore, query } = props;
  const selectable = visible.filter((j) => !queued.has(j.id)).map((j) => j.id);
  const filtered = visible.length !== candidates.length;

  let body: ReactNode;
  let state = 'list';
  if (error) {
    state = 'error';
    body = (
      <EmptyState
        icon={<IconAlert size={20} />}
        title="Could not load jobs."
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onRetry}>
            Retry
          </button>
        }
      >
        {error.message}
      </EmptyState>
    );
  } else if (loading) {
    state = 'loading';
    body = <SkeletonCards count={6} />;
  } else if (candidates.length === 0) {
    state = 'none';
    body = (
      <EmptyState
        icon={<IconBriefcase size={20} />}
        title="No scored jobs yet."
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={props.onSearch} disabled={props.searching}>
            {props.searching ? <span className="spinner" aria-hidden="true" /> : <IconRadar size={14} />}
            Find jobs
          </button>
        }
      />
    );
  } else if (visible.length === 0) {
    state = 'filtered';
    body = (
      <EmptyState
        icon={<IconSearch size={20} />}
        title="No matching jobs."
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onClearFilters}>
            Clear filters
          </button>
        }
      />
    );
  } else {
    body = (
      <div className="dblist">
        <div className="dblist__head jobrow__grid">
          <SelectAll ids={selectable} selected={selected} onToggleAll={props.onToggleAll} />
          <span className="dblist__col dblist__col--name">Job</span>
          <span className="dblist__col dblist__col--end">Score</span>
          <span />
        </div>
        <ul className="dblist__rows">
          <AnimatePresence>
            {visible.map((job, i) => (
              <JobCard key={job.id} index={i} job={job} selected={selected.has(job.id)} queued={queued.has(job.id)} onToggle={props.onToggle} />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  return (
    <div className="page page--jobs">
      {props.notices}
      <div className="dbbar">
        <PillGroup<MinScore>
          label="Minimum score"
          value={minScore}
          onChange={props.onMinScore}
          options={[
            { value: 0, label: 'All', title: 'Any score' },
            { value: 3, label: '3+', title: 'Score 3 or more' },
            { value: 4, label: '4+', title: 'Score 4 or more' },
          ]}
        />
        <div className="dbbar__right">
          <label className="searchbox">
            <IconSearch size={14} />
            <input type="search" value={query} onChange={(e) => props.onQuery(e.target.value)} placeholder="Search" aria-label="Search jobs by title or company" />
          </label>
          {!loading && !error && candidates.length > 0 ? (
            <span className="count num" aria-label={filtered ? `${visible.length} of ${candidates.length} jobs shown` : `${candidates.length} jobs`}>
              <AnimatedNumber value={visible.length} from={visible.length} duration={0.3} />
              {filtered ? ` of ${candidates.length}` : ' jobs'}
            </span>
          ) : null}
        </div>
      </div>
      <StateFade state={state}>{body}</StateFade>
      {props.actionBar}
    </div>
  );
}
