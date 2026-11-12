import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { JobRow } from '../../lib/types';
import { displayName, timeAgo } from '../../lib/format';
import { DUR, EASE, SPRING_SOFT } from '../../lib/motion';
import { CompanyLogo } from '../CompanyLogo';
import { IconBell } from '../Icons';
import { StatusChip } from '../StatusChip';

interface NotifyMenuProps {
  prefs: NotifyPrefs;
  /** The latest applications, newest first. */
  recent: JobRow[];
  now: number;
  onOpenRecent: (job: JobRow) => void;
}

/** The bell: alert settings plus the latest application results. Asks for permission only on a click, never on load. */
export function NotifyMenu({ prefs, recent, now, onOpenRecent }: NotifyMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const on = prefs.enabled;

  return (
    <div className="notify" ref={ref}>
      <button
        type="button"
        className={`icon-btn notify__bell ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={on ? 'Alerts, on' : 'Alerts'}
        title="Alerts"
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell size={19} />
        {on ? <span className="icon-btn__dot" aria-hidden="true" /> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="popover"
            id={id}
            role="dialog"
            aria-label="Alerts"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: DUR.fast, ease: EASE } }}
          >
            <p className="popover__title">Alerts</p>

            {prefs.permission === 'default' ? (
              <button type="button" className="btn btn--secondary btn--sm btn--block" onClick={prefs.request}>
                <IconBell size={15} />
                Turn on notifications
              </button>
            ) : prefs.permission === 'granted' ? (
              <label className="row-switch">
                <span>Browser notifications</span>
                <input type="checkbox" role="switch" checked={!prefs.muted} onChange={(e) => prefs.setMuted(!e.target.checked)} />
                <span className="switch" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
              </label>
            ) : prefs.permission === 'denied' ? (
              <p className="popover__note">Notifications are blocked in this browser's site settings.</p>
            ) : (
              <p className="popover__note">This browser has no notifications.</p>
            )}

            <label className="row-switch">
              <span>Sound</span>
              <input type="checkbox" role="switch" checked={prefs.sound} onChange={(e) => prefs.setSound(e.target.checked)} />
              <span className="switch" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
            </label>

            {recent.length > 0 ? (
              <div className="popover__recent">
                <p className="popover__sub">Recent</p>
                <ul className="recent">
                  {recent.map((job) => {
                    const name = displayName(job);
                    return (
                      <li key={job.id}>
                        <button
                          type="button"
                          className="recent__item"
                          onClick={() => {
                            setOpen(false);
                            onOpenRecent(job);
                          }}
                          title={`${name}: ${job.title}`}
                        >
                          <CompanyLogo name={name} domain={job.company_domain} size={28} />
                          <span className="recent__who">
                            <span className="recent__name">{name}</span>
                            <time className="recent__time mono">{timeAgo(job.updated_at, now)}</time>
                          </span>
                          <StatusChip job={job} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
