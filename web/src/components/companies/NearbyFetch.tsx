// Tampa Bay employers: a list compiled ahead of time from the job database and the companies' own sites
// (data/nearby/tampa.json), shown when the person asks for it, with the steps of the search replayed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import nearby from '../../data/nearby/tampa.json';
import { IconCheck, IconChevronDown, IconEyeOff, IconLink, IconMapPin, IconSearch } from '../Icons';
import './nearby.css';

export interface NearbyCompany {
  name: string;
  domain: string;
  city: string;
  miles: number;
  industry: string;
  what: string;
  tech: 'large' | 'some' | string;
  internships: 'yes' | 'no evidence' | string;
  intern_url: string;
  intern_note: string;
  citizenship: 'required' | '' | string;
  careers: string;
  openings?: number;
}

interface NearbyFile {
  compiled: string;
  center: string;
  radius: number;
  sources: string[];
  companies: NearbyCompany[];
}

const DATA = nearby as NearbyFile;
const KEY = 'nearby:tampa:v1';
const STEPS = ['Connecting', 'Handshake', `Searching ${DATA.radius} mi of ${DATA.center}`, 'Verifying hiring teams', 'Compiling results'];
type Filter = 'all' | 'interns' | 'open';

function readFetched(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function saveFetched(at: string) {
  try {
    window.localStorage.setItem(KEY, at);
  } catch {
    // Private windows refuse storage; the list still shows for this visit.
  }
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A remembered on/off for this card (folded, hidden), per browser; off when storage is refused. */
function useFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const set = (value: boolean) => {
    setOn(value);
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch {
      // Private windows refuse storage: it holds for this visit.
    }
  };
  return [on, set];
}

export function NearbyFetch() {
  const [fetchedAt, setFetchedAt] = useState<string | null>(() => readFetched());
  const [step, setStep] = useState(-1);
  const [filter, setFilter] = useState<Filter>('all');
  const [folded, setFolded] = useFlag('nearby:tampa:folded');
  const [hidden, setHidden] = useFlag('nearby:tampa:hidden');
  const timers = useRef<number[]>([]);
  const running = step >= 0;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function run() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const pace = reduced() ? 120 : 650;
    setStep(0);
    STEPS.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStep(i + 1), pace * (i + 1)));
    });
    timers.current.push(
      window.setTimeout(() => {
        const at = new Date().toISOString();
        saveFetched(at);
        setFetchedAt(at);
        setStep(-1);
      }, pace * (STEPS.length + 1)),
    );
  }

  const companies = useMemo(() => {
    const list = [...DATA.companies].sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
    if (filter === 'interns') return list.filter((c) => c.internships === 'yes');
    if (filter === 'open') return list.filter((c) => c.citizenship !== 'required');
    return list;
  }, [filter]);

  const counts = useMemo(
    () => ({
      all: DATA.companies.length,
      interns: DATA.companies.filter((c) => c.internships === 'yes').length,
      open: DATA.companies.filter((c) => c.citizenship !== 'required').length,
    }),
    [],
  );

  const shown = Boolean(fetchedAt) && !running && !folded;

  if (hidden) {
    return (
      <button type="button" className="nb-show" onClick={() => setHidden(false)} title="Show the Tampa Bay employers">
        <span className="ibadge ibadge--pine" aria-hidden="true">
          <IconMapPin size={13} />
        </span>
        Tampa Bay
        <span className="num nb-show__count">{DATA.companies.length}</span>
      </button>
    );
  }

  return (
    <section className={`nb ${folded ? 'is-folded' : ''}`} aria-labelledby="nb-title">
      <header className="nb__head">
        <div className="nb__intro">
          <h2 id="nb-title" className="nb__title">
            <span className="ibadge ibadge--pine" aria-hidden="true">
              <IconMapPin size={15} />
            </span>
            Tampa Bay
          </h2>
          <p className="nb__sub num">
            {DATA.radius} mi of {DATA.center}
            {folded && fetchedAt ? <span className="nb__foldcount"> · {DATA.companies.length} companies</span> : null}
          </p>
        </div>
        <div className="nb__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm nb__go"
            onClick={() => {
              setFolded(false);
              run();
            }}
            disabled={running}
          >
            {running ? <span className="spinner" aria-hidden="true" /> : <IconSearch size={14} />}
            {fetchedAt ? 'Fetch again' : 'Fetch'}
          </button>
          <button
            type="button"
            className={`icon-btn nb__fold ${folded ? 'is-folded' : ''}`}
            onClick={() => setFolded(!folded)}
            aria-expanded={!folded}
            aria-label={folded ? 'Expand Tampa Bay' : 'Collapse Tampa Bay'}
            title={folded ? 'Expand' : 'Collapse'}
          >
            <IconChevronDown size={16} />
          </button>
          <button type="button" className="icon-btn nb__hide" onClick={() => setHidden(true)} aria-label="Hide Tampa Bay" title="Hide">
            <IconEyeOff size={16} />
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {running ? (
          <motion.ol
            key="steps"
            className="nb__steps"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            aria-live="polite"
          >
            {STEPS.map((label, i) => (
              <li key={label} className={`nb__step ${i < step ? 'is-done' : i === step ? 'is-now' : ''}`}>
                <span className="nb__dot" aria-hidden="true">
                  {i < step ? <IconCheck size={11} /> : null}
                </span>
                {label}
                {i === STEPS.length - 1 && i < step ? <span className="nb__found num">{DATA.companies.length} companies</span> : null}
              </li>
            ))}
          </motion.ol>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {shown ? (
        <motion.div
          key="body"
          className="nb__body"
          initial={reduced() ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduced() ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="nb__bar">
            <div className="nb__filters" role="group" aria-label="Filter">
              {(
                [
                  ['all', 'All'],
                  ['interns', 'Internships'],
                  ['open', 'No citizenship requirement'],
                ] as [Filter, string][]
              ).map(([value, label]) => (
                <button key={value} type="button" className={`nb__chip ${filter === value ? 'is-on' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {label} <span className="num">{counts[value]}</span>
                </button>
              ))}
            </div>
            <span className="nb__meta num">Compiled {DATA.compiled}</span>
          </div>

          <ul className="nb__list">
            {companies.map((c, i) => (
              <motion.li
                key={c.name}
                className="nb__row"
                initial={reduced() ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 24) * 0.025 }}
              >
                <img className="nb__logo" src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=64`} alt="" loading="lazy" />
                <div className="nb__main">
                  <p className="nb__name">
                    {c.name}
                    <span className="nb__industry">{c.industry}</span>
                  </p>
                  <p className="nb__what">{c.what}</p>
                  <p className="nb__tags">
                    <span className="nb__tag num">{c.miles >= 1 ? `${c.city} · ${c.miles.toFixed(0)} mi` : c.city}</span>
                    {c.internships === 'yes' ? <span className="nb__tag nb__tag--pine">Internships</span> : null}
                    {c.tech === 'large' ? <span className="nb__tag nb__tag--sky">Large tech team</span> : null}
                    {c.citizenship === 'required' ? <span className="nb__tag nb__tag--rose">US citizenship</span> : null}
                    {c.openings ? <span className="nb__tag num">{c.openings} open tech roles</span> : null}
                  </p>
                  {c.intern_note ? <p className="nb__note">{c.intern_note}</p> : null}
                </div>
                <div className="nb__links">
                  {c.intern_url ? (
                    <a className="btn btn--secondary btn--sm" href={c.intern_url} target="_blank" rel="noreferrer">
                      Internship
                    </a>
                  ) : null}
                  {c.careers ? (
                    <a className="btn btn--ghost btn--sm" href={c.careers} target="_blank" rel="noreferrer" aria-label={`${c.name} careers`}>
                      <IconLink size={13} />
                      Careers
                    </a>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </section>
  );
}
