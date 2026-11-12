import { useEffect, useId, useRef, useState } from 'react';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import { IconBell } from '../Icons';

/** The bell: asks for notification permission only when the person clicks, never on load. */
export function NotifyMenu({ prefs, variant }: { prefs: NotifyPrefs; variant: 'sidebar' | 'header' }) {
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
  const button =
    variant === 'sidebar' ? (
      <button type="button" className="navitem" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="navitem__icon">
          <IconBell size={20} />
          {on ? <span className="navitem__dot" aria-hidden="true" /> : null}
        </span>
        <span className="navitem__label">Alerts</span>
      </button>
    ) : (
      <button type="button" className="icon-btn" aria-expanded={open} aria-controls={id} aria-label="Notifications" onClick={() => setOpen((v) => !v)}>
        <IconBell size={19} />
        {on ? <span className="icon-btn__dot" aria-hidden="true" /> : null}
      </button>
    );

  return (
    <div className={`notify notify--${variant}`} ref={ref}>
      {button}
      {open ? (
        <div className="popover" id={id} role="dialog" aria-label="Notifications">
          <p className="popover__title">Notifications</p>
          <p className="popover__text">A ping when an application finishes, even when this tab is in the background.</p>

          {prefs.permission === 'default' ? (
            <button type="button" className="btn btn--dark btn--sm btn--block" onClick={prefs.request}>
              <IconBell size={15} />
              Enable notifications
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
            <p className="popover__note">Blocked for this site. Allow notifications in the browser settings, then reload.</p>
          ) : (
            <p className="popover__note">This browser does not support notifications. You still get the in-page messages.</p>
          )}

          <label className="row-switch">
            <span>Soft sound</span>
            <input type="checkbox" role="switch" checked={prefs.sound} onChange={(e) => prefs.setSound(e.target.checked)} />
            <span className="switch" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
