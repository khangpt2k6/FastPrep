import { useEffect, useId, useRef, useState } from 'react';
import { errorText } from '../../lib/errors';
import {
  CALENDAR_KINDS,
  DURATIONS,
  newDraft,
  suggestTitle,
  toPayload,
  validateDraft,
  type CalendarKind,
  type CalendarPayload,
  type DraftErrors,
  type EventDraft,
} from '../../lib/calendar';
import { Dialog } from '../Dialog';
import { PillGroup } from '../common';
import { IconCalendar, IconX } from '../Icons';
import { Switch } from '../settings';

const DEFAULT_MINUTES: Record<CalendarKind, number> = { interview: 45, call: 30, assessment: 90, deadline: 30, other: 30 };

/**
 * Adds an event to Google Calendar through the agent: kind, company (suggested from jobs and the inbox), a title
 * that follows them until it is edited, date, time, length or all day, a meeting link, a place and notes.
 */
export function AddEventDialog({ open, onClose, onAdd, companies, now, online }: {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: CalendarPayload) => Promise<void>;
  /** Company names for the suggestions. */
  companies: string[];
  now: number;
  online: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<EventDraft>(() => newDraft(now));
  const [titleEdited, setTitleEdited] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setDraft(newDraft(Date.now()));
    setTitleEdited(false);
    setErrors({});
    setFailure(null);
    setBusy(false);
  }, [open]);

  const set = (patch: Partial<EventDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.kind && patch.kind !== d.kind) {
        next.minutes = DEFAULT_MINUTES[patch.kind];
        next.allDay = patch.kind === 'deadline';
      }
      if (!titleEdited && (patch.kind !== undefined || patch.company !== undefined)) next.title = suggestTitle(next.kind, next.company);
      return next;
    });

  async function submit() {
    const found = validateDraft(draft, Date.now());
    setErrors(found);
    if (Object.keys(found).length) {
      const first = (['title', 'date', 'time', 'url'] as const).find((k) => found[k]);
      form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onAdd(toPayload(draft));
      onClose();
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: keyof DraftErrors) => (errors[name] ? 'field field--error' : 'field');
  const listId = `${id}-companies`;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`} className="smalldialog caladd">
      <form
        ref={form}
        className="caladd__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="smalldialog__head">
          <h2 id={`${id}-title`}>Add to calendar</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={18} />
          </button>
        </header>

        <div className="field">
          <span className="field__label" id={`${id}-kind`}>
            Kind
          </span>
          <PillGroup<CalendarKind> label="Kind" value={draft.kind} onChange={(kind) => set({ kind })} options={CALENDAR_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
        </div>

        <div className="grid-fields">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-company`}>
              Company
            </label>
            <input id={`${id}-company`} className="input" list={listId} value={draft.company} onChange={(e) => set({ company: e.target.value })} placeholder="Stripe" autoComplete="off" data-autofocus />
            <datalist id={listId}>
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className={field('title')}>
            <label className="field__label" htmlFor={`${id}-name`}>
              Title <span className="field__req">*</span>
            </label>
            <input
              id={`${id}-name`}
              data-field="title"
              className="input"
              value={draft.title}
              onChange={(e) => {
                setTitleEdited(true);
                set({ title: e.target.value });
              }}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${id}-title-err` : undefined}
            />
            {errors.title ? (
              <span className="field__error" id={`${id}-title-err`}>
                {errors.title}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid-fields">
          <div className={field('date')}>
            <label className="field__label" htmlFor={`${id}-date`}>
              Date <span className="field__req">*</span>
            </label>
            <input id={`${id}-date`} data-field="date" type="date" className="input" value={draft.date} onChange={(e) => set({ date: e.target.value })} aria-invalid={Boolean(errors.date)} />
            {errors.date ? <span className="field__error">{errors.date}</span> : null}
          </div>
          <div className={field('time')}>
            <label className="field__label" htmlFor={`${id}-time`}>
              Starts at
            </label>
            <input
              id={`${id}-time`}
              data-field="time"
              type="time"
              className="input"
              value={draft.time}
              disabled={draft.allDay}
              onChange={(e) => set({ time: e.target.value })}
              aria-invalid={Boolean(errors.time)}
            />
            {errors.time ? <span className="field__error">{errors.time}</span> : null}
          </div>
        </div>

        <div className="caladd__when">
          <div className={`field caladd__length ${draft.allDay ? 'is-dim' : ''}`}>
            <span className="field__label">Length</span>
            {draft.allDay ? (
              <span className="caladd__allday">The whole day</span>
            ) : (
              <PillGroup<number> label="Length" value={draft.minutes} onChange={(minutes) => set({ minutes })} options={DURATIONS.map((m) => ({ value: m, label: m < 60 ? `${m} min` : m === 60 ? '1 h' : '1 h 30' }))} />
            )}
          </div>
          <label className="caladd__switch">
            <span>All day</span>
            <Switch checked={draft.allDay} onChange={(allDay) => set({ allDay })} label="All day" />
          </label>
        </div>

        <div className={field('url')}>
          <label className="field__label" htmlFor={`${id}-url`}>
            Meeting link
          </label>
          <input
            id={`${id}-url`}
            data-field="url"
            type="url"
            inputMode="url"
            className="input"
            value={draft.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://meet.google.com/..."
            aria-invalid={Boolean(errors.url)}
          />
          {errors.url ? <span className="field__error">{errors.url}</span> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-where`}>
            Location
          </label>
          <input id={`${id}-where`} className="input" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Phone, video, or an address" />
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-notes`}>
            Notes
          </label>
          <textarea id={`${id}-notes`} className="input textarea" rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Who you meet, what to prepare" />
        </div>

        <p className="caladd__note">{online ? 'The agent adds it to your Google Calendar, then it shows here.' : 'The agent adds it to your Google Calendar once it is online.'}</p>

        {failure ? (
          <p className="form-msg form-msg--error" role="alert">
            {failure}
          </p>
        ) : null}

        <div className="smalldialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <IconCalendar size={15} />}
            Add to calendar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
