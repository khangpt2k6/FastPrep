// Hand-made charts for the Overview. Thin marks, rounded data ends, a surface gap between touching marks, recessive
// chrome, text in ink tokens (never the series colour), a hover tooltip on every plot, and a table view per card.
import { useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { CompanyLogo } from '../CompanyLogo';
import type { Bin, HeatDay, TrailStage } from '../../lib/overview';
import { heatLevel } from '../../lib/overview';
import { tampaFormat, tampaParts } from '../../lib/time';

/** A tooltip that follows the hovered mark inside its card. Content is plain text, never HTML. */
export function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const show = (event: { clientX: number; clientY: number }, lines: string[]) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, lines });
  };
  const showAt = (el: Element, lines: string[]) => {
    const rect = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: r.left + r.width / 2 - rect.left, y: r.top - rect.top, lines });
  };
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="ctip" style={{ left: tip.x, top: tip.y } as CSSProperties} role="status">
      <strong>{tip.lines[0]}</strong>
      {tip.lines.slice(1).map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  ) : null;
  return { box, show, showAt, hide, node };
}

/** A card with a title, an optional line under it, and a Chart / Table switch when a table is given. */
export function ChartCard({ title, sub, icon, tone = 'ember', table, aside, className = '', children }: {
  title: string;
  /** Kept as the title's tooltip: the card shows no helper line. */
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'ember' | 'sky' | 'pine' | 'plum' | 'rose' | 'sand';
  table?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section className={`card ocard ${className}`} aria-labelledby={id}>
      <header className="ocard__head">
        <div className="ocard__titles">
          {icon ? (
            <span className={`ibadge ibadge--${tone}`} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h2 className="ocard__title" id={id} title={typeof sub === 'string' ? sub : undefined}>
            {title}
          </h2>
        </div>
        <div className="ocard__aside">
          {aside}
          {table ? (
            <button type="button" className="btn btn--ghost btn--xs" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Chart' : 'Table'}
            </button>
          ) : null}
        </div>
      </header>
      {asTable && table ? <div className="ocard__table">{table}</div> : children}
    </section>
  );
}

/** A plain table for a chart's table view. */
export function VTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="vtable">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j} className="num">
                  {typeof c === 'number' ? c.toLocaleString() : c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SHORT_DAY = tampaFormat({ month: 'short', day: 'numeric' });

/** Fourteen days as a line: the first week in the quiet gray, this week in ember, a dot on today. Draws in. */
export function Sparkline({ series, days, unit }: { series: number[]; days: string[]; unit: string }) {
  const tip = useTip();
  const w = 120;
  const h = 34;
  const max = Math.max(1, ...series);
  const x = (i: number) => (i / (series.length - 1)) * (w - 6) + 3;
  const y = (v: number) => h - 4 - (v / max) * (h - 10);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const all = `M${pts.join('L')}`;
  const week = `M${pts.slice(series.length - 8).join('L')}`;
  const area = `${all}L${x(series.length - 1).toFixed(1)},${h - 2}L${x(0).toFixed(1)},${h - 2}Z`;
  const last = series.length - 1;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * last)));
    const date = Date.parse(`${days[i]}T12:00:00`);
    tip.show(e, [`${series[i]} ${unit}`, SHORT_DAY.format(date)]);
  };
  return (
    <div className="spark" ref={tip.box}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={tip.hide} aria-hidden="true" focusable="false">
        <path d={area} className="spark__area" />
        <path d={all} className="spark__line" pathLength={100} />
        <path d={week} className="spark__week" pathLength={100} />
      </svg>
      <span className="spark__dot" style={{ left: `${(x(last) / w) * 100}%`, top: y(series[last]) }} aria-hidden="true" />
      {tip.node}
    </div>
  );
}

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTH = tampaFormat({ month: 'short' });
const LONG_DAY = tampaFormat({ weekday: 'short', month: 'short', day: 'numeric' });

/** Twelve weeks, a cell a day, from frost to deep ember. Columns fade in one after another. Drawn at its own size. */
export function Heatmap({ weeks }: { weeks: HeatDay[][] }) {
  const tip = useTip();
  const cell = 20;
  const gap = 4;
  const left = 32;
  const top = 20;
  const width = left + weeks.length * (cell + gap) - gap;
  const height = top + 7 * (cell + gap) - gap;
  const days = weeks.flat().filter((d) => !d.future);
  const thisWeek = weeks[weeks.length - 1].filter((d) => !d.future).reduce((a, d) => a + d.total, 0);
  const active = days.filter((d) => d.total > 0).length;
  const best = days.reduce<HeatDay | null>((top1, d) => (d.total > (top1?.total ?? 0) ? d : top1), null);
  let lastMonth = -1;
  return (
    <div className="heat" ref={tip.box}>
      <div className="heat__plot">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="heat__svg" role="img" aria-label="Applications and letters per day, last 12 weeks">
          {weeks.map((week, w) => {
            const month = tampaParts(week[0].date).month;
            const label = month !== lastMonth ? MONTH.format(week[0].date) : '';
            lastMonth = month;
            return label ? (
              <text key={`m${w}`} x={left + w * (cell + gap)} y={12} className="heat__month">
                {label}
              </text>
            ) : null;
          })}
          {WEEKDAYS.map((d, i) =>
            d ? (
              <text key={d} x={0} y={top + i * (cell + gap) + cell - 6} className="heat__wday">
                {d}
              </text>
            ) : null,
          )}
          {weeks.map((week, w) =>
            week.map((day, d) =>
              day.future ? null : (
                <rect
                  key={day.day}
                  x={left + w * (cell + gap)}
                  y={top + d * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={4}
                  className={`heat__cell heat--${heatLevel(day.total)}`}
                  style={{ '--col': w } as CSSProperties}
                  onPointerEnter={(e) => tip.showAt(e.currentTarget, [day.total ? `${day.applications} applications, ${day.letters} letters` : 'Nothing that day', LONG_DAY.format(day.date)])}
                  onPointerLeave={tip.hide}
                />
              ),
            ),
          )}
        </svg>
        <div className="heat__legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat__swatch heat--${l}`} />
          ))}
          <span>More</span>
        </div>
      </div>
      <dl className="heat__aside">
        <div>
          <dt>This week</dt>
          <dd className="num">{thisWeek}</dd>
        </div>
        <div>
          <dt>Days with activity</dt>
          <dd className="num">{active}</dd>
        </div>
        <div>
          <dt>Busiest day</dt>
          <dd>{best ? `${SHORT_DAY.format(best.date)}, ${best.total}` : 'None yet'}</dd>
        </div>
      </dl>
      {tip.node}
    </div>
  );
}

/** Scores in half steps as columns; the strong ones (4 and up) in ember, the rest quiet, a line at 4. */
export function Histogram({ bins }: { bins: Bin[] }) {
  const tip = useTip();
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="hist" ref={tip.box} role="img" aria-label={`How many jobs got each score: ${bins.map((b) => `${b.from.toFixed(1)} to ${(b.to - 0.1).toFixed(1)}, ${b.count}`).join('; ')}`}>
      <div className="hist__plot" aria-hidden="true">
        <span className="hist__ref" style={{ left: `${(6 / bins.length) * 100}%` }}>
          <span className="hist__reflabel">Strong 4+</span>
        </span>
        {bins.map((b, i) => (
          <span
            key={b.from}
            className="hist__col"
            onPointerEnter={(e) => tip.showAt(e.currentTarget.querySelector('.hist__bar') ?? e.currentTarget, [`${b.count} jobs`, `Score ${b.from.toFixed(1)} to ${(b.to - 0.1).toFixed(1)}`])}
            onPointerLeave={tip.hide}
          >
            {b.count ? <span className="hist__cap num">{b.count}</span> : null}
            <span className={`hist__bar ${b.from >= 4 ? 'is-strong' : ''}`} style={{ height: `${(b.count / max) * 100}%`, '--i': i } as CSSProperties} />
          </span>
        ))}
      </div>
      <div className="hist__axis" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} style={{ left: `${((s - 1) / 4) * 100}%` }}>
            {s}
          </span>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

/** Ranked bars, one hue, largest first: a name (with a logo when there is one), the bar, the figure. */
export function BarList({ items, unit }: {
  items: { key: string; label: string; value: number; extra?: string; domain?: string; logo?: boolean }[];
  unit: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="barlist">
      {items.map((it, i) => (
        <li key={it.key} className="barlist__row" style={{ '--i': i } as CSSProperties}>
          <span className="barlist__name">
            {it.logo ? <CompanyLogo name={it.label} domain={it.domain} size={22} /> : null}
            <span className="barlist__label">{it.label}</span>
          </span>
          <span className="barlist__track" aria-hidden="true">
            <span className="barlist__bar" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="barlist__value num">
            {it.value}
            {it.extra ? <span className="barlist__extra">{it.extra}</span> : null}
          </span>
          <span className="sr-only">
            {it.value} {unit}
            {it.extra ? `, ${it.extra}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One whole split into parts, a 2px gap between them, and a legend with each part's name and count. */
export function SegmentedBar({ parts, label }: { parts: { key: string; label: string; count: number; tone: string }[]; label: string }) {
  const tip = useTip();
  const total = parts.reduce((a, p) => a + p.count, 0);
  const shown = parts.filter((p) => p.count > 0);
  return (
    <div className="segbar" ref={tip.box}>
      <div className="segbar__bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
        {shown.map((p, i) => (
          <span
            key={p.key}
            className={`segbar__part tone--${p.tone}`}
            style={{ flexGrow: p.count, '--i': i } as CSSProperties}
            onPointerEnter={(e) => tip.showAt(e.currentTarget, [`${p.count} ${p.label.toLowerCase()}`, `${Math.round((p.count / total) * 100)}% of ${total}`])}
            onPointerLeave={tip.hide}
          />
        ))}
      </div>
      <ul className="legend" aria-hidden="true">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`legend__key tone--${p.tone}`} />
            {p.label}
            <span className="legend__count num">{p.count}</span>
          </li>
        ))}
      </ul>
      {tip.node}
    </div>
  );
}

/** The pipeline as a dotted trail with a node per stage, counts over them and the share that got to the next. */
export function Trail({ stages, active }: { stages: TrailStage[]; active: boolean }) {
  return (
    <div className={`trail ${active ? 'is-active' : ''}`}>
      <div className="trail__line" aria-hidden="true">
        {active ? <span className="trail__runner" /> : null}
      </div>
      <ol className="trail__stages">
        {stages.map((s, i) => {
          const next = stages[i + 1];
          const rate = next && s.count > 0 ? (next.count / s.count) * 100 : null;
          return (
            <li key={s.key} className="trail__stage" style={{ '--i': i } as CSSProperties}>
              <span className="trail__count">{s.count.toLocaleString()}</span>
              <span className={`trail__node trail__node--${i}`} aria-hidden="true" />
              <span className="trail__label">{s.label}</span>
              {next ? (
                <span
                  className="trail__rate num"
                  title={
                    rate !== null && rate >= 100
                      ? `${next.count.toLocaleString()} at ${next.label}, ${s.count.toLocaleString()} at ${s.label}: not every one went through ${s.label} first`
                      : `${s.label} to ${next.label}`
                  }
                >
                  {rate === null ? 'none' : rate >= 100 ? 'all' : rate >= 10 ? `${Math.round(rate)}%` : `${rate.toFixed(1)}%`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
