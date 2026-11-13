// Ported from Arena.vie's Companies page: what intern and new grad postings ask for, company by company. Loaded on its
// own (React.lazy in Dashboard), so the research data and the tech icons stay out of the main bundle.
import { useMemo } from 'react';
import { CATEGORIES, companies, type Company, type CompanyCategory } from '../../data/companies';
import { displayName, logoDomain } from '../../lib/format';
import { normName } from '../../lib/jobs';
import type { JobRow } from '../../lib/types';
import { EmptyState } from '../common';
import { IconSearch, IconX } from '../Icons';
import { PageHeader } from '../shell/PageHeader';
import { CompanyCard } from './CompanyCard';
import { TechIcon } from './TechChip';
import './companies.css';

/** How many companies ask for each technology, most asked first. */
const MOST_ASKED = (() => {
  const counts = new Map<string, number>();
  for (const company of companies) for (const tech of company.need) counts.set(tech, (counts.get(tech) ?? 0) + 1);
  return [...counts.entries()].filter(([tech]) => tech !== 'Any language').sort((a, b) => b[1] - a[1]).slice(0, 14);
})();

const PER_CATEGORY = (() => {
  const counts = new Map<CompanyCategory, number>();
  for (const company of companies) counts.set(company.category, (counts.get(company.category) ?? 0) + 1);
  return counts;
})();

/** The agent's jobs at a company: by its domain, else by its name. The key opens the Jobs page filtered to it. */
function jobsAt(company: Company, jobs: JobRow[]): { count: number; key: string } {
  const domain = company.domain.toLowerCase();
  const name = normName(company.name);
  let byDomain = 0;
  let count = 0;
  for (const job of jobs) {
    const d = logoDomain(job.company_domain);
    const domainHit = Boolean(d) && (d === domain || d.endsWith(`.${domain}`));
    if (domainHit) byDomain += 1;
    if (domainHit || (name && normName(displayName(job)) === name)) count += 1;
  }
  return { count, key: byDomain > 0 ? domain : company.name };
}

interface CompaniesPageProps {
  /** The agent's open jobs, for the per-card count. */
  jobs: JobRow[];
  params: URLSearchParams;
  setParams: (patch: Record<string, string | null>) => void;
  onSeeJobs: (companyKey: string) => void;
}

export default function CompaniesPage({ jobs, params, setParams, onSeeJobs }: CompaniesPageProps) {
  // Filters live in the address, so "who wants Go" is a link to send.
  const query = params.get('q') ?? '';
  const tech = params.get('tech');
  const typeParam = params.get('type');
  const category = typeParam && (CATEGORIES as readonly string[]).includes(typeParam) ? (typeParam as CompanyCategory) : null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((company) => {
      if (category && company.category !== category) return false;
      if (tech && !company.need.includes(tech) && !company.stack.includes(tech)) return false;
      if (!needle) return true;
      return [company.name, company.category, company.summary, ...company.need, ...company.stack, ...company.niche].join(' ').toLowerCase().includes(needle);
    });
  }, [category, query, tech]);

  const counts = useMemo(() => new Map(companies.map((c) => [c.slug, jobsAt(c, jobs)])), [jobs]);
  const pickTech = (name: string) => setParams({ tech: tech === name ? null : name });

  return (
    <div className="page page--companies">
      <PageHeader
        wolf="laptop"
        title="Companies"
        count={shown.length}
        subtitle="What intern and new grad postings ask for, company by company."
        actions={
          <label className="searchpill searchpill--wide">
            <span className="sr-only">Search companies</span>
            <IconSearch size={15} />
            <input type="search" value={query} onChange={(e) => setParams({ q: e.target.value || null })} placeholder="Company or tech" />
          </label>
        }
      />

      <div className="copills" role="group" aria-label="Kind of company">
        {([null, ...CATEGORIES] as (CompanyCategory | null)[]).map((value) => {
          const on = category === value;
          return (
            <button key={value ?? 'all'} type="button" aria-pressed={on} className={`copill press ${on ? 'is-on' : ''}`} onClick={() => setParams({ type: value })}>
              {value ?? 'All'}
              <span className="copill__count num">{value ? PER_CATEGORY.get(value) : companies.length}</span>
            </button>
          );
        })}
      </div>

      <div className="asked" role="group" aria-label="Most asked">
        <span className="asked__label">Most asked</span>
        {MOST_ASKED.map(([name, count]) => {
          const on = tech === name;
          return (
            <button key={name} type="button" aria-pressed={on} className={`askchip press ${on ? 'is-on' : ''}`} onClick={() => pickTech(name)}>
              <TechIcon name={name} />
              {name}
              <span className="askchip__count num">{count}</span>
            </button>
          );
        })}
        {tech && !MOST_ASKED.some(([name]) => name === tech) ? (
          <button type="button" className="askchip is-on press" onClick={() => setParams({ tech: null })} aria-label={`Clear ${tech}`}>
            <TechIcon name={tech} />
            {tech}
            <IconX size={12} />
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <EmptyState wolf="thinking" title="No matches" />
      ) : (
        <div className="cogrid stagger">
          {shown.map((company) => {
            const hit = counts.get(company.slug) ?? { count: 0, key: company.domain };
            return <CompanyCard key={company.slug} company={company} tech={tech} onPickTech={pickTech} jobs={hit.count} onSeeJobs={() => onSeeJobs(hit.key)} />;
          })}
        </div>
      )}
    </div>
  );
}
