// Billing on the Agent page, the way an AI service shows an account: who and on what plan, how much of the budget is used
// with when it starts again, and what the money went on, by the day or the week.
import { useMemo, useState } from 'react';
import { usd } from '../../lib/format';
import type { AgentSettings, AiEngine, UsageRow } from '../../lib/types';
import { BrandLogo } from '../BrandLogo';
import { PillGroup } from '../common';
import './usage.css';

const ENGINE_NAME: Record<AiEngine, string> = { api: 'OpenAI API', codex: 'Codex', claude: 'Claude Code' };
const PLAN: Record<AiEngine, string> = { api: 'Pay per use', codex: 'ChatGPT plan', claude: 'Claude plan' };
// Each kind of work, as the page names it, and a way to spend less on it.
const KINDS: Record<string, { name: string; tip?: string }> = {
  forms: { name: 'Filling forms', tip: 'Claude Code or Codex fill them on your plan' },
  scoring: { name: 'Scoring jobs', tip: 'fewer jobs scored per round' },
  letters: { name: 'Cover letters', tip: 'write them only for jobs you apply to' },
  resume: { name: 'Reading resumes' },
  companies: { name: 'Company names' },
  other: { name: 'Other' },
};

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The day `n` days before `today` (yyyy-mm-dd). */
export function daysBefore(today: string, n: number): string {
  const date = day(today);
  date.setUTCDate(date.getUTCDate() - n);
  return iso(date);
}

/** "Dec 1": the first day of the month after `today`. */
function nextMonth(today: string): string {
  const date = day(today);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Meter({ label, spent, limit, resets }: { label: string; spent: number; limit: number | null; resets: string }) {
  const share = limit ? Math.min(1, spent / limit) : 0;
  const tone = share >= 1 ? 'is-full' : share >= 0.8 ? 'is-high' : '';
  return (
    <div className="ubar">
      <div className="ubar__top">
        <span>{label}</span>
        <span className="num">{limit === null ? `${usd(spent)} · No limit` : `${Math.round(share * 100)}%`}</span>
      </div>
      <div className={`ubar__track ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span className="ubar__fill" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="ubar__note num">
        {limit === null ? resets : `${usd(spent)} of ${usd(limit)} · ${resets}`}
      </p>
    </div>
  );
}

export interface UsagePanelProps {
  settings: AgentSettings;
  rows: UsageRow[];
  /** The person's day, yyyy-mm-dd. */
  today: string;
  email: string;
  model: string;
}

export function UsagePanel({ settings, rows, today, email, model }: UsagePanelProps) {
  const [range, setRange] = useState<'day' | 'week'>('day');
  const month = today.slice(0, 7);
  const spentToday = rows.find((r) => r.day === today)?.api_usd ?? 0;
  const spentMonth = rows.filter((r) => r.day.startsWith(month)).reduce((sum, r) => sum + (Number(r.api_usd) || 0), 0);
  const planToday = rows.find((r) => r.day === today)?.codex_runs ?? 0;

  // What the money went on, in the range; plan questions when no money was spent.
  const parts = useMemo(() => {
    const from = range === 'day' ? today : daysBefore(today, 6);
    const usdBy: Record<string, number> = {};
    const runsBy: Record<string, number> = {};
    for (const row of rows) {
      if (row.day < from || row.day > today) continue;
      for (const [kind, amount] of Object.entries(row.breakdown?.usd ?? {})) usdBy[kind] = (usdBy[kind] ?? 0) + Number(amount);
      for (const [kind, count] of Object.entries(row.breakdown?.runs ?? {})) runsBy[kind] = (runsBy[kind] ?? 0) + Number(count);
    }
    const money = Object.values(usdBy).reduce((a, b) => a + b, 0);
    const by = money > 0 ? usdBy : runsBy;
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    return {
      money: money > 0,
      rows: Object.entries(by)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, value]) => ({ kind, value, share: total ? value / total : 0 })),
    };
  }, [rows, range, today]);

  const brand = settings.engine === 'claude' ? 'claude' : 'openai';
  return (
    <section className="card upanel" aria-labelledby="upanel-title">
      <h2 id="upanel-title" className="sr-only">
        Billing and usage
      </h2>
      <div className="upanel__part">
        <p className="upanel__label">Account</p>
        <dl className="upanel__rows">
          <div>
            <dt>Engine</dt>
            <dd>
              <BrandLogo brand={brand} size={15} />
              {ENGINE_NAME[settings.engine]}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{PLAN[settings.engine]}</dd>
          </div>
          {model ? (
            <div>
              <dt>Model</dt>
              <dd>{model}</dd>
            </div>
          ) : null}
          {email ? (
            <div>
              <dt>Email</dt>
              <dd className="upanel__email">{email}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="upanel__part">
        <p className="upanel__label">Usage</p>
        <Meter label="Today" spent={spentToday} limit={settings.budget_day} resets="Resets at 12:00 AM" />
        <Meter label="This month" spent={spentMonth} limit={settings.budget_month} resets={`Resets ${nextMonth(today)}`} />
        <div className="ubar__top upanel__plan">
          <span>Plan questions today</span>
          <span className="num">{planToday}</span>
        </div>
      </div>

      <div className="upanel__part">
        <p className="upanel__label">What it went on</p>
        <div className="upanel__range">
          <PillGroup<'day' | 'week'>
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
            ]}
          />
          <span className="upanel__hint">{parts.money ? 'API dollars' : 'Plan questions'} · this computer's agent</span>
        </div>
        {parts.rows.length ? (
          <ul className="upanel__kinds">
            {parts.rows.map(({ kind, share, value }) => {
              const known = KINDS[kind] ?? { name: kind };
              return (
                <li key={kind}>
                  <span className="upanel__kind">
                    <strong>{known.name}</strong>
                    {known.tip && parts.money ? <span> · {known.tip}</span> : null}
                  </span>
                  <span className="num" title={parts.money ? usd(value) : `${value} questions`}>
                    {Math.round(share * 100)}%
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="upanel__empty">Nothing yet.</p>
        )}
      </div>
    </section>
  );
}
