import { forwardRef, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { JobRow } from '../../lib/types';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { displayName, firstLocation, isNewJob, matchInfo, timeAgo } from '../../lib/format';
import { foundAt, scoreTier } from '../../lib/jobs';
import { CompanyLogo } from '../CompanyLogo';
import { CheckBox, NewTag, Tag } from '../common';
import { IconLink } from '../Icons';

interface JobCardProps {
  job: JobRow;
  selected: boolean;
  queued: boolean;
  saved: boolean;
  onToggle: (id: string) => void;
  onSave: (id: string) => void;
  now: number;
  /** Position in the list: the row's number, its stripe, the entrance stagger and whether it gets layout animation. */
  index?: number;
}

/** The score as colored text and five small dashes that grow in: teal 4 and up, amber 3 to 3.9, red below 3. */
export function ScoreDashes({ score, index = 0 }: { score: number | null; index?: number }) {
  const tier = scoreTier(score);
  const known = tier !== 'none';
  const filled = known ? Math.max(1, Math.min(5, Math.round(score as number))) : 0;
  const tip = known ? `${matchInfo(score as number).label}, ${(score as number).toFixed(1)} of 5` : 'Not scored';
  return (
    <span className={`score score--${tier}`} role="img" aria-label={tip} title={tip} style={{ '--row': Math.min(index, 12) } as CSSProperties}>
      <span className="score__val num" aria-hidden="true">
        {known ? (score as number).toFixed(1) : '-'}
      </span>
      <span className="score__dashes" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`score__dash ${i < filled ? 'is-on' : ''}`} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
    </span>
  );
}

/** One job as a zebra row: checkbox, number, title with a New tag, company chip, place, when it was found, the score. */
export const JobCard = forwardRef<HTMLLIElement, JobCardProps>(function JobCard({ job, selected, queued, saved, onToggle, onSave, now, index = 0 }, ref) {
  const name = displayName(job);
  const place = firstLocation(job.location);
  const fresh = isNewJob(job, now);
  return (
    <motion.li
      ref={ref}
      className={`jrow ${index % 2 === 0 ? 'is-striped' : ''} ${selected ? 'is-selected' : ''} ${queued ? 'is-queued' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <label className="jrow__hit">
        <span className="check">
          <input type="checkbox" checked={selected} disabled={queued} onChange={() => onToggle(job.id)} aria-label={`Select ${job.title} at ${name}`} />
          <CheckBox />
        </span>
        <span className="jrow__num num" aria-hidden="true">
          {index + 1}.
        </span>
        <span className="jrow__main">
          <span className="jrow__titleline">
            <span className="jrow__title">{job.title}</span>
            {fresh ? <NewTag /> : null}
            {queued ? <Tag color="gray">Queued</Tag> : null}
          </span>
          <span className="jrow__sub">
            <span className="jrow__co">
              <CompanyLogo name={name} domain={job.company_domain} size={18} />
              <span className="jrow__coname">{name}</span>
            </span>
            {place.first ? (
              <span className="jrow__place jrow__place--inline" title={job.location}>
                {place.first}
                {place.more ? <span className="jrow__more num"> +{place.more}</span> : null}
              </span>
            ) : null}
          </span>
        </span>
        <span className="jrow__loc" title={job.location}>
          {place.first ? (
            <>
              <span className="jrow__place">{place.first}</span>
              {place.more ? <span className="jrow__more num">+{place.more}</span> : null}
            </>
          ) : (
            <span className="muted">Anywhere</span>
          )}
        </span>
        <time className="jrow__time num" dateTime={foundAt(job)} title="Found">
          {timeAgo(foundAt(job), now).replace(' ago', '')}
        </time>
        <ScoreDashes score={job.score} index={index} />
      </label>
      <button
        type="button"
        className={`jrow__star press ${saved ? 'is-on' : ''}`}
        onClick={() => onSave(job.id)}
        aria-pressed={saved}
        aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}
        title={saved ? 'Saved' : 'Save'}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </button>
      {job.url ? (
        <a className="jrow__link press" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`} title="Open posting">
          <IconLink size={15} />
        </a>
      ) : (
        <span className="jrow__link" aria-hidden="true" />
      )}
    </motion.li>
  );
});
