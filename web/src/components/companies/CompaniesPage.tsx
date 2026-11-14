// Ported from Arena.vie's Companies page: what intern and new grad postings ask for, company by company. Loaded on its
// own (React.lazy in Dashboard), so the research data and the tech icons stay out of the main bundle.
import { useMemo } from 'react';
import { CATEGORIES, TIERS, companies, type Company, type CompanyCategory, type CompanyTier } from '../../data/companies';
import { displayName, logoDomain } from '../../lib/format';
import { normName } from '../../lib/jobs';
import type { JobRow } from '../../lib/types';
import { EmptyState, PillGroup } from '../common';
import { IconSearch, IconX } from '../Icons';
import { PageHeader } from '../shell/PageHeader';
import { CompanyCard } from './CompanyCard';
import { NearbyFetch } from './NearbyFetch';
import { TechIcon } from './TechChip';
import './companies.css';

/** How many companies ask for each technology, most asked first. */
const MOST_ASKED = (() => {
  const counts = new Map<string, number>();
  for (const company of companies) for (const tech of company.need) counts.set(tech, (counts.get(tech) ?? 0) + 1);
  return [...counts.entries()].filter(([tech]) => tech !== 'Any language').sort((a, b) => b[1] - a[1]).slice(0, 14);
})();

const PER_TIER = (() => {
  const counts = new Map<CompanyTier, number>();
  for (const company of companies) if (company.tier) counts.set(company.tier, (counts.get(company.tier) ?? 0) + 1);
  return counts;
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
  const tierParam = params.get('tier');
  const tier = tierParam && (TIERS as readonly string[]).includes(tierParam) ? (tierParam as CompanyTier) : null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((company) => {
      if (category && company.category !== category) return false;
      if (tier && company.tier !== tier) return false;
      if (tech && !company.need.includes(tech) && !company.stack.includes(tech)) return false;
      if (!needle) return true;
      return [company.name, company.category, company.summary, ...company.need, ...company.stack, ...company.niche].join(' ').toLowerCase().includes(needle);
    });
  }, [category, query, tech, tier]);

  const counts = useMemo(() => new Map(companies.map((c) => [c.slug, jobsAt(c, jobs)])), [jobs]);
  const pickTech = (name: string) => setParams({ tech: tech === name ? null : name });

  return (
    <div className="page page--companies">
      <PageHeader
        page="companies"
        title="Companies"
        count={shown.length}
        actions={
          <label className="searchfield">
            <span className="sr-only">Search companies</span>
            <IconSearch size={15} />
            <input type="search" value={query} onChange={(e) => setParams({ q: e.target.value || null })} placeholder="Company or tech" />
          </label>
        }
      />

      <NearbyFetch />

      <PillGroup<string>
        label="Kind of company"
        value={category ?? 'all'}
        onChange={(value) => setParams({ type: value === 'all' ? null : value })}
        options={[{ value: 'all', label: 'All', count: companies.length }, ...CATEGORIES.map((c) => ({ value: c, label: c, count: PER_CATEGORY.get(c) ?? 0 }))]}
      />

      <PillGroup<string>
        label="Company size"
        value={tier ?? 'all'}
        onChange={(value) => setParams({ tier: value === 'all' ? null : value })}
        options={[{ value: 'all', label: 'Any size', count: companies.length }, ...TIERS.map((t) => ({ value: t, label: t, count: PER_TIER.get(t) ?? 0 }))]}
      />

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
        <EmptyState
          friend="raccoon-thinking"
          title="No companies match"
          text={query ? `Nothing for "${query}" with these filters.` : 'Nothing with these filters.'}
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setParams({ q: null, tech: null, type: null })}>
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="cogrid">
          {shown.map((company, i) => {
            const hit = counts.get(company.slug) ?? { count: 0, key: company.domain };
            return <CompanyCard key={company.slug} index={i} company={company} tech={tech} onPickTech={pickTech} jobs={hit.count} onSeeJobs={() => onSeeJobs(hit.key)} />;
          })}
        </div>
      )}
    </div>
  );
}
