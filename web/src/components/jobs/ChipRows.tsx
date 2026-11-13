import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CompanyCount } from '../../lib/jobs';
import { CompanyLogo } from '../CompanyLogo';
import { IconChevronDown, IconSearch } from '../Icons';

const LINE = 30;

/** Kinds of roles read from the titles, with counts, after Arena's topic tags: one line, Expand for the rest. */
export function RoleChips({ kinds, active, onPick }: { kinds: { name: string; count: number }[]; active: string | null; onPick: (kind: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > LINE + 6);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [kinds.length]);

  if (kinds.length === 0) return null;

  const toggle = (
    <button type="button" className="roles__toggle press" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      {open ? 'Collapse' : 'Expand'}
      <IconChevronDown size={14} className={open ? 'is-flipped' : ''} />
    </button>
  );

  return (
    <div className="roles" role="group" aria-label="Kinds of roles">
      <div ref={box} className="roles__row" style={open ? undefined : { maxHeight: LINE }}>
        {kinds.map((k) => {
          const on = k.name === active;
          return (
            <button key={k.name} type="button" className={`role press ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onPick(on ? null : k.name)}>
              {k.name}
              <span className="role__count num">{k.count}</span>
            </button>
          );
        })}
        {open ? toggle : null}
      </div>
      {!open && overflows ? <div className="roles__more">{toggle}</div> : null}
    </div>
  );
}

/** The company filter: the busiest few as chips, every company in a searchable picker. */
export function CompanyBar({ companies, active, onPick }: { companies: CompanyCount[]; active: string | null; onPick: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  // The panel is portalled to the body and follows its button, so the cards below never paint over it.
  useLayoutEffect(() => {
    if (!open) return;
    const follow = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      setPlace({ top: rect.bottom + 8, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) });
    };
    follow();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (companies.length === 0) return null;

  const activeRow = active ? companies.find((c) => c.key === active) : undefined;
  const top = companies.slice(0, 4);
  const inBar = activeRow && !top.includes(activeRow) ? [activeRow, ...top.slice(0, 3)] : top;
  const needle = query.trim().toLowerCase();
  const matches = needle ? companies.filter((c) => c.name.toLowerCase().includes(needle) || c.domain.includes(needle)) : companies;

  const pick = (key: string | null) => {
    onPick(key);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="cobar" role="group" aria-label="Filter by company">
      <span className="cobar__label">Companies</span>
      {inBar.map((c) => {
        const on = c.key === active;
        return (
          <button key={c.key} type="button" className={`cochip press ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onPick(on ? null : c.key)} title={on ? 'Show every company' : `Only ${c.name}`}>
            <CompanyLogo name={c.name} domain={c.domain} size={22} />
            <span className="cochip__name">{c.name}</span>
            <span className="cochip__count num">{c.count}</span>
          </button>
        );
      })}
      <div ref={box} className="cobar__all">
        <button ref={trigger} type="button" className="cochip cochip--all press" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
          <IconSearch size={14} />
          All companies
          <span className="cochip__count num">{companies.length}</span>
          <IconChevronDown size={13} className={open ? 'is-flipped' : ''} />
        </button>
        {open && place
          ? createPortal(
              <div ref={panel} role="dialog" aria-label="All companies" className="copicker" style={{ top: place.top, left: place.left }}>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches[0]) pick(matches[0].key);
                  }}
                  placeholder="Search companies"
                  aria-label="Search companies"
                  className="copicker__search"
                />
                <ul className="copicker__list">
                  {active && !needle ? (
                    <li>
                      <button type="button" className="copicker__item copicker__item--clear press" onClick={() => pick(null)}>
                        Clear company filter
                      </button>
                    </li>
                  ) : null}
                  {matches.map((c) => (
                    <li key={c.key}>
                      <button type="button" className={`copicker__item press ${c.key === active ? 'is-on' : ''}`} aria-pressed={c.key === active} onClick={() => pick(c.key === active ? null : c.key)}>
                        <CompanyLogo name={c.name} domain={c.domain} size={22} />
                        <span className="copicker__name">{c.name}</span>
                        <span className="copicker__count num">{c.count}</span>
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 ? <li className="copicker__none">No company matches "{query}".</li> : null}
                </ul>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
