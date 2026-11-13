// The Overview: how the hunt is going, from rows the app already loads. A briefing over the contour map, six KPI
// tiles, the trail from a posting found to an interview, activity and score charts, where the matches are, the
// inbox, the best untried matches and what happened lately.
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Page } from '../../hooks/useRoute';
import type { CoverLetterRow } from '../../lib/coverLetter';
import { displayName, firstLocation, plural, timeAgo } from '../../lib/format';
import { statusOf, type InboxRow } from '../../lib/inbox';
import { workMode } from '../../lib/jobs';
import {
  briefing,
  buildHeatmap,
  buildKpis,
  buildTrail,
  companyLookup,
  greeting,
  inboxBreakdown,
  kindBreakdown,
  lastDays,
  recentActivity,
  scoreHistogram,
  topCompanies,
  type ActivityItem,
  type Kpi,
  type OverviewInput,
} from '../../lib/overview';
import type { AgentRow, CommandRow, JobRow, LoadError } from '../../lib/types';
import { CompanyLogo } from '../CompanyLogo';
import { Tag } from '../common';
import { IconAlert, IconCheck, IconLetter, IconLink, IconRadar, IconSend, IconTerminal, IconTrend } from '../Icons';
import { MatchMeter } from '../jobs/MatchMeter';
import { Wolf, wolfForState } from '../mascot/Wolf';
import { Contours, TrailDivider } from '../motif';
import { AnimatedNumber, Shimmer } from '../motion';
import type { AgentTone } from '../agent/live';
import { BarList, ChartCard, Heatmap, Histogram, SegmentedBar, Sparkline, Trail, VTable } from './charts';
import './overview.css';

interface OverviewProps {
  firstName: string;
  agent: AgentRow | null;
  tone: AgentTone;
  /** The agent's state, 'offline' when it is not running. */
  state: string;
  /** A short line on what it is doing now. */
  line: string;
  /** Every job row, applications included. */
  jobs: JobRow[];
  /** Scored jobs that can still be applied to. */
  candidates: JobRow[];
  jobsLoading: boolean;
  jobsError: LoadError | null;
  letters: CoverLetterRow[];
  inbox: InboxRow[];
  inboxLoading: boolean;
  /** The inbox table is not in this database yet. */
  inboxMissing: boolean;
  commands: CommandRow[];
  now: number;
  searching: boolean;
  onSearch: () => void;
  onReviewStrong: () => void;
  onNavigate: (page: Page) => void;
  selected: Set<string>;
  queued: Set<string>;
  onToggle: (id: string) => void;
  /** Callouts on top: Live mode, agent offline, profile unfinished. */
  notices?: ReactNode;
}

const STATUS_TONE: Record<string, string> = {
  rejected: 'rejected',
  applied: 'applied',
  assessment: 'assessment',
  interview: 'interview',
  offer: 'offer',
};

/** A block with no data yet: one short line and the trail. */
function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="cempty">
      <p>{children}</p>
      <TrailDivider />
    </div>
  );
}

/** A block while its rows load: gray bars with a sweep. */
function ChartSkeleton({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className={`cskel ${tall ? 'cskel--tall' : ''}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton skeleton--line" style={{ width: `${88 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** A KPI: the number counting up, its change against the week before, and fourteen days as a line. */
function KpiTile({ kpi, days, loading, index }: { kpi: Kpi; days: string[]; loading: boolean; index: number }) {
  const diff = kpi.thisWeek - kpi.lastWeek;
  const change = diff === 0 ? 'Same as last week' : `${diff > 0 ? '+' : ''}${diff} vs last week`;
  return (
    <article className="kpi" style={{ '--i': index } as CSSProperties} aria-label={`${kpi.label}: ${kpi.value}. ${kpi.thisWeek} in the last 7 days, ${kpi.lastWeek} the 7 before.`}>
      <p className="kpi__label">{kpi.label}</p>
      {loading ? (
        <span className="skeleton kpi__skel" />
      ) : (
        <p className="kpi__value" aria-hidden="true">
          <AnimatedNumber id={`kpi-${kpi.key}`} value={kpi.value} />
        </p>
      )}
      {loading ? (
        <>
          <span className="skeleton skeleton--line kpi__skelline" />
          <span className="skeleton kpi__skelspark" />
        </>
      ) : (
        <>
          <p className={`kpi__delta ${diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : ''}`} aria-hidden="true">
            {diff !== 0 ? <IconTrend size={12} className={diff < 0 ? 'is-flipped' : ''} /> : null}
            <span className="num">{change}</span>
          </p>
          <Sparkline series={kpi.series} days={days} unit={kpi.label.toLowerCase()} />
          {kpi.note ? <p className="kpi__note">{kpi.note}</p> : null}
        </>
      )}
    </article>
  );
}

const ACTIVITY_ICON: Record<ActivityItem['kind'], ReactNode> = {
  letter: <IconLetter size={13} />,
  sent: <IconSend size={13} />,
  filled: <IconCheck size={13} />,
  stopped: <IconAlert size={13} />,
  found: <IconRadar size={13} />,
  command: <IconTerminal size={13} />,
};

export function OverviewPage(props: OverviewProps) {
  const { jobs, candidates, letters, inbox, commands, agent, now, jobsLoading, inboxLoading, selected, queued } = props;
  // Charts follow the minute, not the 2 second clock, so they do not redraw all the time.
  const minute = Math.floor(now / 60000);
  const input: OverviewInput = useMemo(() => ({ jobs, letters, inbox, commands, agent, now: minute * 60000 }), [jobs, letters, inbox, commands, agent, minute]);
  const kpis = useMemo(() => buildKpis(input), [input]);
  const days = useMemo(() => lastDays(14, input.now), [input.now]);
  const trail = useMemo(() => buildTrail(input), [input]);
  const heat = useMemo(() => buildHeatmap(input), [input]);
  const bins = useMemo(() => scoreHistogram(jobs), [jobs]);
  const companies = useMemo(() => topCompanies(jobs), [jobs]);
  const kinds = useMemo(() => kindBreakdown(jobs), [jobs]);
  const inboxParts = useMemo(() => inboxBreakdown(inbox), [inbox]);
  const activity = useMemo(() => recentActivity(input), [input]);
  const lookup = useMemo(() => companyLookup(jobs), [jobs]);
  const best = useMemo(
    () =>
      [...candidates]
        .filter((j) => !queued.has(j.id))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 6),
    [candidates, queued],
  );
  const replies = useMemo(
    () =>
      [...inbox]
        .filter((r) => r.status !== 'applied')
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 4),
    [inbox],
  );

  const scored = jobs.filter((j) => j.score !== null).length;
  const strong = jobs.filter((j) => (j.score ?? 0) >= 4).length;
  // The ones still open, as the Jobs page will list them at 4+.
  const openStrong = candidates.filter((j) => (j.score ?? 0) >= 4).length;
  const heatTotal = heat.flat().reduce((a, d) => a + d.total, 0);
  const inboxTotal = inbox.length;
  const busy = props.tone === 'busy';
  const quiet = props.tone === 'off' || props.tone === 'paused';
  const mood = quiet ? 'music' : props.tone === 'bad' ? 'thinking' : wolfForState(props.state);
  const dateLine = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);

  return (
    <div className="overview page">
      <section className="brief" aria-labelledby="brief-title">
        <Contours className="brief__map" />
        <div className="brief__text">
          <p className="brief__date">{dateLine}</p>
          <h1 className="brief__title" id="brief-title">
            {greeting(now)}
            {props.firstName ? `, ${props.firstName}` : ''}
          </h1>
          <p className="brief__line">{jobsLoading ? <Shimmer>Reading the numbers</Shimmer> : briefing(input)}</p>
          <div className="brief__actions">
            <button type="button" className="btn btn--ember" onClick={props.onReviewStrong} aria-label={`Review strong matches, ${openStrong} open`}>
              Review strong matches
              {openStrong ? <span className="btn__count num">{openStrong}</span> : null}
            </button>
            <button type="button" className="btn btn--secondary" onClick={props.onSearch} disabled={props.searching}>
              <IconRadar size={15} className={props.searching ? 'spin-slow' : ''} />
              {props.searching ? <Shimmer>Finding jobs</Shimmer> : 'Find more'}
            </button>
          </div>
        </div>
        <div className={`brief__wolf brief__wolf--${props.tone}`}>
          <Wolf mood={mood} size={132} motion={busy ? 'bob' : 'idle'} dim={quiet} alert={props.tone === 'bad'} eager />
          <p className="brief__status">
            <span className={`brief__dot brief__dot--${props.tone}`} aria-hidden="true" />
            <Shimmer active={busy}>{props.line}</Shimmer>
          </p>
        </div>
      </section>

      {props.notices}

      <section className="kpis" aria-label="Key numbers">
        {kpis.map((k, i) => (
          <KpiTile key={k.key} kpi={k} days={days} loading={jobsLoading} index={i} />
        ))}
      </section>

      <ChartCard
        title="The trail"
        sub="From a posting found to an interview, with the share that made it to the next stop."
        className="ocard--trail"
        table={<VTable head={['Stage', 'Count']} rows={trail.map((s) => [s.label, s.count])} />}
      >
        {jobsLoading ? <ChartSkeleton rows={2} /> : <Trail stages={trail} active={busy} />}
      </ChartCard>

      <div className="ogrid ogrid--wide">
        <ChartCard
          title="Activity"
          sub={heatTotal ? `${plural(heatTotal, 'application or letter', 'applications and letters')} in 12 weeks` : 'Applications and letters per day'}
          table={
            <VTable
              head={['Week of', 'Applications', 'Letters']}
              rows={heat.map((w) => [new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(w[0].date), w.reduce((a, d) => a + d.applications, 0), w.reduce((a, d) => a + d.letters, 0)])}
            />
          }
        >
          {jobsLoading ? <ChartSkeleton rows={5} tall /> : <Heatmap weeks={heat} />}
        </ChartCard>
        <ChartCard
          title="Match quality"
          sub={scored ? `${plural(scored, 'job')} scored, ${strong} at 4 or more` : 'Scores from 1 to 5'}
          table={<VTable head={['Score', 'Jobs']} rows={bins.map((b) => [`${b.from.toFixed(1)} to ${(b.to - 0.1).toFixed(1)}`, b.count])} />}
        >
          {jobsLoading ? <ChartSkeleton rows={5} tall /> : scored ? <Histogram bins={bins} /> : <ChartEmpty>No scores yet. They show up as the agent reads postings.</ChartEmpty>}
        </ChartCard>
      </div>

      <div className="ogrid">
        <ChartCard
          title="Where the matches are"
          sub="Scored jobs by company and by kind of role"
          table={<VTable head={['Company', 'Jobs', 'Best score']} rows={companies.map((c) => [c.name, c.count, c.best.toFixed(1)])} />}
        >
          {jobsLoading ? (
            <ChartSkeleton rows={6} />
          ) : companies.length ? (
            <div className="where">
              <div className="where__col">
                <p className="where__label">Top companies</p>
                <BarList unit="jobs" items={companies.map((c) => ({ key: c.key, label: c.name, value: c.count, extra: `best ${c.best.toFixed(1)}`, domain: c.domain, logo: true }))} />
              </div>
              <div className="where__col">
                <p className="where__label">Kinds of role</p>
                <BarList unit="jobs" items={kinds.map((k) => ({ key: k.name, label: k.name, value: k.count }))} />
              </div>
            </div>
          ) : (
            <ChartEmpty>No scored jobs yet.</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard
          title="Inbox"
          sub={inboxTotal ? `${plural(inboxTotal, 'application')} tracked from your mail` : 'Replies, read from your mail'}
          table={inboxTotal ? <VTable head={['Status', 'Applications']} rows={inboxParts.map((p) => [p.label, p.count])} /> : undefined}
          aside={
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => props.onNavigate('inbox')}>
              Open
            </button>
          }
        >
          {inboxLoading ? (
            <ChartSkeleton rows={4} />
          ) : props.inboxMissing ? (
            <ChartEmpty>Needs the latest supabase/schema.sql.</ChartEmpty>
          ) : inboxTotal ? (
            <>
              <SegmentedBar
                label="Applications by status"
                parts={[...inboxParts]
                  .sort((a, b) => ['rejected', 'applied', 'assessment', 'interview', 'offer'].indexOf(a.status) - ['rejected', 'applied', 'assessment', 'interview', 'offer'].indexOf(b.status))
                  .map((p) => ({ key: p.status, label: p.label, count: p.count, tone: STATUS_TONE[p.status] ?? 'applied' }))}
              />
              {replies.length ? (
                <ul className="replies">
                  {replies.map((r) => {
                    const hit = lookup(r.company);
                    const name = hit?.name ?? r.company;
                    const st = statusOf(r.status);
                    return (
                      <li key={r.id} className="replies__row">
                        <CompanyLogo name={name} domain={hit?.domain} size={28} />
                        <span className="replies__text">
                          <span className="replies__name">{name}</span>
                          <span className="replies__role">{r.role}</span>
                        </span>
                        <Tag color={st.color}>{st.label}</Tag>
                        <time className="replies__time num" dateTime={r.updated_at}>
                          {timeAgo(r.updated_at, now)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="ocard__quiet">No replies yet.</p>
              )}
            </>
          ) : (
            <ChartEmpty>No replies yet. Answers from employers show up here.</ChartEmpty>
          )}
        </ChartCard>
      </div>

      <div className="ogrid">
        <ChartCard
          title="Best matches right now"
          sub="The highest scores you have not applied to"
          aside={
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => props.onNavigate('jobs')}>
              All jobs
            </button>
          }
        >
          {jobsLoading ? (
            <ChartSkeleton rows={6} />
          ) : best.length ? (
            <ul className="bestlist">
              {best.map((job, i) => {
                const name = displayName(job);
                const place = firstLocation(job.location).first;
                const mode = workMode(job);
                const on = selected.has(job.id);
                return (
                  <li key={job.id} className={`bestrow ${on ? 'is-selected' : ''}`} style={{ '--i': i } as CSSProperties}>
                    <CompanyLogo name={name} domain={job.company_domain} size={34} />
                    <span className="bestrow__text">
                      <span className="bestrow__title" title={job.title}>
                        {job.title}
                      </span>
                      <span className="bestrow__sub">
                        {name}
                        {place ? ` · ${place}` : ''}
                        {mode && mode !== 'On site' && !new RegExp(`^${mode}$`, 'i').test(place) ? ` · ${mode}` : ''}
                      </span>
                    </span>
                    <MatchMeter score={job.score} compact index={i} />
                    <span className="bestrow__actions">
                      {job.url ? (
                        <a className="btn btn--ghost btn--xs" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open the ${name} posting`}>
                          <IconLink size={13} />
                          Open
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={`btn btn--xs ${on ? 'btn--primary' : 'btn--secondary'}`}
                        aria-pressed={on}
                        onClick={() => props.onToggle(job.id)}
                        aria-label={on ? `Unselect ${job.title} at ${name}` : `Select ${job.title} at ${name}`}
                      >
                        {on ? <IconCheck size={13} /> : null}
                        {on ? 'Selected' : 'Select'}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ChartEmpty>{candidates.length ? 'Every match is queued or applied.' : 'No scored jobs yet. Find more to start.'}</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard title="Recent activity" sub="Letters, applications, new jobs and what you asked for">
          {jobsLoading ? (
            <ChartSkeleton rows={6} />
          ) : activity.length ? (
            <ol className="timeline">
              {activity.map((a, i) => (
                <li key={a.id} className={`timeline__item timeline__item--${a.kind}`} style={{ '--i': i } as CSSProperties}>
                  <span className="timeline__node" aria-hidden="true">
                    {ACTIVITY_ICON[a.kind]}
                  </span>
                  <span className="timeline__text">{a.text}</span>
                  <time className="timeline__time num" dateTime={a.at}>
                    {timeAgo(a.at, now)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <ChartEmpty>Nothing yet. What the agent does shows up here.</ChartEmpty>
          )}
        </ChartCard>
      </div>
      {props.jobsError ? <p className="ocard__quiet">Could not load jobs: {props.jobsError.message}</p> : null}
    </div>
  );
}
