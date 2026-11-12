import { forwardRef } from 'react';
import { motion } from 'motion/react';
import type { JobRow } from '../../lib/types';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { displayName, firstLocation } from '../../lib/format';
import { CompanyLogo } from '../CompanyLogo';
import { CheckBox, ScoreTag, Tag } from '../common';
import { IconLink } from '../Icons';

interface JobCardProps {
  job: JobRow;
  selected: boolean;
  queued: boolean;
  onToggle: (id: string) => void;
  /** Position in the list: drives the entrance stagger and whether it gets layout animation. */
  index?: number;
}

/** One job as a database row: checkbox, logo, title, "Company · Location", score tag and the posting link. */
export const JobCard = forwardRef<HTMLLIElement, JobCardProps>(function JobCard({ job, selected, queued, onToggle, index = 0 }, ref) {
  const name = displayName(job);
  const place = firstLocation(job.location);
  return (
    <motion.li
      ref={ref}
      className={`dbrow jobrow ${selected ? 'is-selected' : ''} ${queued ? 'is-queued' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <label className="jobrow__hit">
        <span className="check">
          <input
            type="checkbox"
            checked={selected}
            disabled={queued}
            onChange={() => onToggle(job.id)}
            aria-label={`Select ${job.title} at ${name}`}
          />
          <CheckBox />
        </span>
        <CompanyLogo name={name} domain={job.company_domain} size={28} />
        <span className="jobrow__main">
          <span className="jobrow__title">{job.title}</span>
          <span className="jobrow__sub">
            <span className="jobrow__company">{name}</span>
            {place.first ? (
              <span className="jobrow__loc" title={job.location}>
                <span className="jobrow__place">{place.first}</span>
                {place.more ? <span className="jobrow__more num">+{place.more}</span> : null}
              </span>
            ) : null}
          </span>
        </span>
        <span className="jobrow__tags">
          {queued ? <Tag color="gray">Queued</Tag> : null}
          <ScoreTag score={job.score} />
        </span>
      </label>
      {job.url ? (
        <a className="icon-btn jobrow__link" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
          <IconLink size={15} />
        </a>
      ) : (
        <span className="jobrow__link" aria-hidden="true" />
      )}
    </motion.li>
  );
});
