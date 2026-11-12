import { forwardRef } from 'react';
import { motion } from 'motion/react';
import type { JobRow } from '../../lib/types';
import { LAYOUT_CAP, SPRING, cardHover, riseItem } from '../../lib/motion';
import { displayName, firstLocation } from '../../lib/format';
import { CompanyLogo } from '../CompanyLogo';
import { CheckBox, ScoreRing } from '../common';
import { IconLink } from '../Icons';

interface JobCardProps {
  job: JobRow;
  selected: boolean;
  queued: boolean;
  onToggle: (id: string) => void;
  /** Position in the list: drives the entrance stagger and whether it gets layout animation. */
  index?: number;
}

export const JobCard = forwardRef<HTMLLIElement, JobCardProps>(function JobCard({ job, selected, queued, onToggle, index = 0 }, ref) {
  const name = displayName(job);
  const place = firstLocation(job.location);
  return (
    <motion.li
      ref={ref}
      className={`card spot jobcard ${selected ? 'is-selected' : ''} ${queued ? 'is-queued' : ''}`}
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
            aria-label={`Select ${job.title} at ${name}`}
          />
          <CheckBox />
        </span>
        <CompanyLogo name={name} domain={job.company_domain} size={44} />
        <span className="jobcard__main">
          <span className="jobcard__title">{job.title}</span>
          <span className="jobcard__sub">
            <span className="jobcard__company">{name}</span>
            {place.first ? (
              <span className="jobcard__loc" title={job.location}>
                <span className="jobcard__place">{place.first}</span>
                {place.more ? <span className="jobcard__more mono">+{place.more}</span> : null}
              </span>
            ) : null}
            {queued ? <span className="tag tag--queued">Queued</span> : null}
          </span>
        </span>
        <ScoreRing score={job.score} />
      </label>
      {job.url ? (
        <a className="icon-btn jobcard__link" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
          <IconLink size={16} />
        </a>
      ) : null}
    </motion.li>
  );
});
