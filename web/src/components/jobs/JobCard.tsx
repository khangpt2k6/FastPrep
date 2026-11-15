import { forwardRef } from 'react';
import { motion } from 'motion/react';
import type { JobRow } from '../../lib/types';
import type { Prior } from '../../lib/applied';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { displayName, firstLocation, isNewJob, timeAgo } from '../../lib/format';
import { foundAt, placeOf, workMode } from '../../lib/jobs';
import { CompanyLogo } from '../CompanyLogo';
import { CheckBox, NewTag, Tag } from '../common';
import { IconLink, IconStar, IconX } from '../Icons';
import { MatchMeter } from './MatchMeter';

interface JobCardProps {
  job: JobRow;
  selected: boolean;
  queued: boolean;
  /** Takes the job out of the agent's queue. */
  onUnqueue?: (id: string) => void;
  saved: boolean;
  onToggle: (id: string) => void;
  onSave: (id: string) => void;
  now: number;
  /** Position in the list: the entrance stagger and whether it gets layout animation. */
  index?: number;
  /** An application at the same company, from the inbox. */
  prior?: Prior | null;
}

/**
 * One job: the checkbox, the logo, the title over company, place and work mode, when it was found (with New for the
 * last day), the match meter, then save and open. The whole left part toggles the selection.
 */
export const JobCard = forwardRef<HTMLLIElement, JobCardProps>(function JobCard({ job, selected, queued, onUnqueue, saved, onToggle, onSave, now, index = 0, prior = null }, ref) {
  const name = displayName(job);
  const place = firstLocation(placeOf(job));
  const fresh = isNewJob(job, now);
  // A place that already says Remote needs no Remote hint after it.
  const mode = workMode(job) === 'Remote' && /^remote$/i.test(place.first.trim()) ? '' : workMode(job);
  const found = timeAgo(foundAt(job), now);
  return (
    <motion.li
      ref={ref}
      className={`jrow ${selected ? 'is-selected' : ''} ${queued ? 'is-queued' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <label className="jrow__hit">
        <span className="check jrow__check">
          <input type="checkbox" checked={selected} disabled={queued} onChange={() => onToggle(job.id)} aria-label={`Select ${job.title} at ${name}`} />
          <CheckBox />
        </span>
        <CompanyLogo name={name} domain={job.company_domain} size={36} className="jrow__logo" />
        <span className="jrow__main">
          <span className="jrow__titleline">
            <span className="jrow__title">{job.title}</span>
            {queued ? (
              <span className="jrow__queued">
                <Tag color="gray">Queued</Tag>
                {onUnqueue ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm jrow__unqueue"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUnqueue(job.id);
                    }}
                    aria-label={`Take ${job.title} out of the queue`}
                    title="Take it out of the queue"
                  >
                    <IconX size={12} />
                  </button>
                ) : null}
              </span>
            ) : null}
          </span>
          <span className="jrow__meta">
            <span className="jrow__co">{name}</span>
            {prior ? (
              <span className="jrow__prior" title={`You applied to ${prior.role || 'a role'} here${prior.at ? `, ${timeAgo(prior.at, now)}` : ''}`}>
                Applied there
              </span>
            ) : null}
            {place.first ? (
              <span className="jrow__place" title={job.location}>
                {place.first}
                {place.more ? <span className="jrow__more num"> +{place.more}</span> : null}
              </span>
            ) : null}
            {mode ? <span className={`jrow__mode jrow__mode--${mode === 'On site' ? 'onsite' : mode.toLowerCase()}`}>{mode}</span> : null}
          </span>
        </span>
        <span className="jrow__when">
          {fresh ? <NewTag /> : null}
          <time className="jrow__time num" dateTime={foundAt(job)}>
            found {found}
          </time>
        </span>
        <MatchMeter score={job.score} index={index} />
      </label>
      <span className="jrow__acts">
        <button
          type="button"
          className={`icon-btn jrow__star ${saved ? 'is-on' : ''}`}
          onClick={() => onSave(job.id)}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}
          title={saved ? 'Saved' : 'Save'}
        >
          <IconStar size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
        {job.url ? (
          <a className="icon-btn jrow__open" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
            <IconLink size={15} />
          </a>
        ) : (
          <span className="jrow__open" aria-hidden="true" />
        )}
      </span>
    </motion.li>
  );
});
