import type { CSSProperties, ReactNode } from 'react';
import { SummaryPop, useReveal } from './reveal';
import type { Company, Posting } from '../../data/companies';
import { IconBriefcase } from '../Icons';
import { TechChip } from './TechChip';

const EVIDENCE: Record<Company['evidence'], { label: string; tone: string }> = {
  A: { label: 'Evidence A: both postings found and name tech', tone: 'a' },
  B: { label: 'Evidence B: a posting found but generic', tone: 'b' },
  C: { label: 'Evidence C: no posting, inferred from engineering sources', tone: 'c' },
};

function Row({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="cocard__row">
      <span className="cocard__rowlabel" title={title}>
        {label}
      </span>
      <div className="cocard__chips">{children}</div>
    </div>
  );
}

function PostingLink({ label, posting }: { label: string; posting: Posting }) {
  if (!posting.found || !posting.url) {
    return (
      <span className="posting posting--none" title={`No ${label.toLowerCase()} posting found`}>
        {label}
      </span>
    );
  }
  const cycle = posting.cycle?.split('(')[0].split(';')[0].trim();
  return (
    <a className="posting press" href={posting.url} target="_blank" rel="noreferrer">
      {label}
      {cycle ? <span className="posting__cycle">{cycle}</span> : null}
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M4.5 2.5h5v5M9.5 2.5 3 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/** Up to two initials, "Jane Street" to JS and "Microsoft" to MI. */
function initials(name: string): string {
  const words = name.split(/[\s/]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** The company's logo on a white tile, or its initials when there is no logo on file. */
export function CompanyMonogram({ company }: { company: Company }) {
  if (company.logo) {
    return (
      <span className="comono">
        <img src={company.logo} alt="" loading="lazy" />
      </span>
    );
  }
  return (
    <span className="comono comono--text" aria-hidden="true">
      {initials(company.name)}
    </span>
  );
}

export function CompanyCard({ company, tech, onPickTech, jobs, onSeeJobs, index = 0 }: {
  company: Company;
  /** Its place in the grid: cards in one row load in one after another. */
  index?: number;
  tech: string | null;
  onPickTech: (name: string) => void;
  /** How many jobs the agent has from this company. */
  jobs: number;
  onSeeJobs: () => void;
}) {
  const evidence = EVIDENCE[company.evidence];
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <article ref={ref} className={`card cocard ${shown ? 'is-in' : ''}`} style={{ '--col': index % 3 } as CSSProperties}>
      <header className="cocard__head">
        <CompanyMonogram company={company} />
        <div className="cocard__who">
          <h2 className="cocard__name">{company.name}</h2>
          <p className="cocard__cat">{company.tier ? `${company.category} · ${company.tier}` : company.category}</p>
        </div>
        {jobs > 0 ? (
          <span className="cocard__jobs num" title={`The agent has ${jobs} ${jobs === 1 ? 'job' : 'jobs'} from ${company.name}`}>
            {jobs} {jobs === 1 ? 'job' : 'jobs'}
          </span>
        ) : null}
        <span className={`evidence evidence--${evidence.tone}`} title={evidence.label} aria-label={evidence.label}>
          {company.evidence}
        </span>
      </header>

      <Row label="Need" title="Required in intern and new grad postings">
        {company.need.map((name) => (
          <TechChip key={name} name={name} tone="need" active={tech === name} onPick={onPickTech} />
        ))}
      </Row>
      {company.stack.length > 0 ? (
        <Row label="Stack" title="Company tech stack">
          {company.stack.map((name) => (
            <TechChip key={name} name={name} tone="stack" active={tech === name} onPick={onPickTech} />
          ))}
        </Row>
      ) : null}
      {company.niche.length > 0 ? (
        <Row label="Niche" title="Taught on the job, not needed to apply">
          {company.niche.map((name) => (
            <TechChip key={name} name={name} tone="niche" />
          ))}
        </Row>
      ) : null}

      <footer className="cocard__foot">
        <SummaryPop title={company.name}>{company.summary}</SummaryPop>
        <PostingLink label="Intern" posting={company.intern} />
        <PostingLink label="New grad" posting={company.newGrad} />
        {jobs > 0 ? (
          <button type="button" className="btn btn--secondary btn--sm cocard__see" onClick={onSeeJobs}>
            <IconBriefcase size={14} />
            See jobs
          </button>
        ) : null}
      </footer>
    </article>
  );
}
