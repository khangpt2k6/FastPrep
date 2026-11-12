import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import type { JobRow, LoadError } from '../../lib/types';
import { plural } from '../../lib/format';
import { EmptyState, PillGroup, SkeletonCards } from '../common';
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
  now: number;
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
  /** The live strip shown above the list when the rail is folded away. */
  strip: ReactNode;
  rail: ReactNode;
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
    <label className="check check--text selectall">
      <input ref={ref} type="checkbox" checked={all} disabled={ids.length === 0} onChange={() => onToggleAll(ids, !all)} />
      <span className="check__box" aria-hidden="true" />
      <span>Select all</span>
    </label>
  );
}

export function JobsPage(props: JobsPageProps) {
  const { candidates, visible, loading, error, selected, queued, minScore, query } = props;
  const selectable = visible.filter((j) => !queued.has(j.id)).map((j) => j.id);

  let body: ReactNode;
  let state = 'list';
  if (error) {
    state = 'error';
    body = (
      <EmptyState
        icon={<IconAlert size={22} />}
        title="Could not load jobs"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onRetry}>
            Try again
          </button>
        }
      >
        {error.message}
      </EmptyState>
    );
  } else if (loading) {
    state = 'loading';
    body = <SkeletonCards count={5} />;
  } else if (candidates.length === 0) {
    state = 'none';
    body = (
      <EmptyState
        icon={<IconBriefcase size={22} />}
        title="No scored jobs yet"
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={props.onSearch} disabled={props.searching}>
            <IconRadar size={15} />
            Find jobs now
          </button>
        }
      >
        When the agent runs, it searches the job database and scores each posting against your resume. The best ones show up
        here.
      </EmptyState>
    );
  } else if (visible.length === 0) {
    state = 'filtered';
    body = (
      <EmptyState
        icon={<IconSearch size={22} />}
        title="No jobs match these filters"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={props.onClearFilters}>
            Clear filters
          </button>
        }
      >
        {plural(candidates.length, 'job')} hidden by the match or search filter.
      </EmptyState>
    );
  } else {
    body = (
      <ul className="cardlist">
        <AnimatePresence>
          {visible.map((job, i) => (
            <JobCard
              key={job.id}
              index={i}
              job={job}
              now={props.now}
              selected={selected.has(job.id)}
              queued={queued.has(job.id)}
              onToggle={props.onToggle}
            />
          ))}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <div className="page page--rail">
      <div className="page__main">
        {props.strip}
        <div className="toolbar">
          <SelectAll ids={selectable} selected={selected} onToggleAll={props.onToggleAll} />
          <PillGroup<MinScore>
            label="Minimum match"
            value={minScore}
            onChange={props.onMinScore}
            options={[
              { value: 0, label: 'Any match' },
              { value: 3, label: '3+' },
              { value: 4, label: '4+' },
            ]}
          />
          <label className="searchbox">
            <IconSearch size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => props.onQuery(e.target.value)}
              placeholder="Title or company"
              aria-label="Search jobs by title or company"
            />
          </label>
          <button type="button" className="btn btn--secondary toolbar__more" onClick={props.onSearch} disabled={props.searching}>
            {props.searching ? <span className="spinner" aria-hidden="true" /> : <IconRadar size={16} />}
            Find more jobs
          </button>
        </div>
        {!loading && !error && candidates.length > 0 ? (
          <p className="listmeta">
            {visible.length === candidates.length ? (
              <>
                <AnimatedNumber value={candidates.length} from={candidates.length} /> {candidates.length === 1 ? 'job' : 'jobs'} ready to
                apply, best match first
              </>
            ) : (
              <>
                Showing <AnimatedNumber value={visible.length} from={visible.length} /> of {plural(candidates.length, 'job')}
              </>
            )}
          </p>
        ) : null}
        <StateFade state={state}>{body}</StateFade>
        {props.actionBar}
      </div>
      <aside className="rail" aria-label="Agent and profile">
        {props.rail}
      </aside>
    </div>
  );
}
