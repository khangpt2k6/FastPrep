import { forwardRef } from 'react';
import { motion } from 'motion/react';
import type { JobRow } from '../../lib/types';
import { LAYOUT_CAP, SPRING, cardHover, riseItem } from '../../lib/motion';
import { companyName, timeAgo } from '../../lib/format';
import { Avatar, MatchBadge } from '../common';
import { IconClock, IconLink, IconMapPin } from '../Icons';

interface JobCardProps {
  job: JobRow;
  selected: boolean;
  queued: boolean;
  now: number;
  onToggle: (id: string) => void;
  /** Position in the list: drives the entrance stagger and whether it gets layout animation. */
  index?: number;
}

export const JobCard = forwardRef<HTMLLIElement, JobCardProps>(function JobCard({ job, selected, queued, now, onToggle, index = 0 }, ref) {
  return (
    <motion.li
      ref={ref}
      className={`card jobcard ${selected ? 'is-selected' : ''} ${queued ? 'is-queued' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      whileHover={cardHover}
      transition={{ layout: SPRING }}
    >
      <label className="jobcard__hit">
        <span className="check jobcard__check">
          <input
            type="checkbox"
            checked={selected}
            disabled={queued}
            onChange={() => onToggle(job.id)}
            aria-label={`Select ${job.title} at ${job.company}`}
          />
          <span className="check__box" aria-hidden="true" />
        </span>
        <Avatar name={companyName(job.company)} />
        <span className="jobcard__main">
          <span className="jobcard__title">{job.title}</span>
          <span className="jobcard__sub">
            <span className="jobcard__company">{companyName(job.company)}</span>
            {job.location ? (
              <span className="jobcard__loc" title={job.location}>
                <IconMapPin size={13} />
                <span>{job.location}</span>
              </span>
            ) : null}
          </span>
          <span className="jobcard__meta">
            <IconClock size={13} />
            Updated {timeAgo(job.updated_at, now)}
            {queued ? <span className="tag tag--queued">Queued for the agent</span> : null}
          </span>
        </span>
        <MatchBadge score={job.score} />
      </label>
      {job.url ? (
        <a className="icon-btn jobcard__link" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${job.company} posting`}>
          <IconLink size={17} />
        </a>
      ) : null}
    </motion.li>
  );
});
