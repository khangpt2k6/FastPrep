import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { JobRow } from '../../lib/types';
import { displayName, timeAgo } from '../../lib/format';
import { menuVariants } from '../../lib/motion';
import { CompanyLogo } from '../CompanyLogo';
import { IconBell } from '../Icons';
import { StatusChip } from '../StatusChip';

interface NotifyMenuProps {
  prefs: NotifyPrefs;
  /** The latest applications, newest first. */
  recent: JobRow[];
  now: number;
  onOpenRecent: (job: JobRow) => void;
  /** sidebar: a row at the foot of the sidebar, its menu opens to the right; bar: a bell in the phone's top bar. */
  variant: 'sidebar' | 'bar';
}

/** Alerts: notification settings and the latest results. Asks for permission only on a click, never on load. */
export function NotifyMenu({ prefs, recent, now, onOpenRecent, variant }: NotifyMenuProps) {
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
  const toggle = () => setOpen((v) => !v);

  return (
    <div className={`notify notify--${variant}`} ref={ref}>
      {variant === 'sidebar' ? (
        <button type="button" className={`sfoot ${open ? 'is-open' : ''}`} aria-expanded={open} aria-controls={id} onClick={toggle}>
          <span className="sfoot__icon" aria-hidden="true">
            <IconBell size={16} />
          </span>
          <span className="sfoot__label">Alerts</span>
          <span className={`sfoot__state ${on ? 'is-on' : ''}`}>{on ? 'On' : 'Off'}</span>
        </button>
      ) : (
        <button type="button" className="icon-btn" aria-expanded={open} aria-controls={id} aria-label={on ? 'Alerts, on' : 'Alerts'} title="Alerts" onClick={toggle}>
          <IconBell size={18} />
          {on ? <span className="icon-btn__dot" aria-hidden="true" /> : null}
        </button>
      )}
      <AnimatePresence>
        {open ? (
          <motion.div className="menu" id={id} role="dialog" aria-label="Alerts" variants={menuVariants} initial="hidden" animate="shown" exit="gone">
            <p className="menu__title">Alerts</p>

            {prefs.permission === 'default' ? (
              <button type="button" className="btn btn--secondary btn--sm btn--block" onClick={prefs.request}>
                <IconBell size={14} />
                Turn on notifications
              </button>
            ) : prefs.permission === 'granted' ? (
              <label className="switchrow switchrow--full">
                <span className="switchrow__label">Notifications</span>
                <input type="checkbox" role="switch" checked={!prefs.muted} onChange={(e) => prefs.setMuted(!e.target.checked)} />
                <span className="switch" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
              </label>
            ) : prefs.permission === 'denied' ? (
              <p className="menu__note">Blocked in browser settings.</p>
            ) : (
              <p className="menu__note">Not supported in this browser.</p>
            )}

            <label className="switchrow switchrow--full">
              <span className="switchrow__label">Sound</span>
              <input type="checkbox" role="switch" checked={prefs.sound} onChange={(e) => prefs.setSound(e.target.checked)} />
              <span className="switch" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
            </label>

            {recent.length > 0 ? (
              <div className="menu__section">
                <p className="menu__label">Recent</p>
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
                          <CompanyLogo name={name} domain={job.company_domain} size={24} />
                          <span className="recent__who">
                            <span className="recent__name">{name}</span>
                            <time className="recent__time num">{timeAgo(job.updated_at, now)}</time>
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
