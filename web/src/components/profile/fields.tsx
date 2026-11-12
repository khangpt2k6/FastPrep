import { useId, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { PRESENT } from '../../lib/profile';
import { CheckBox } from '../common';
import { IconX } from '../Icons';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'month';
  autoComplete?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  list?: string;
  wide?: boolean;
}

export function TextField({ label, value, onChange, placeholder, type = 'text', autoComplete, required, error, hint, list, wide }: TextFieldProps) {
  const id = useId();
  const help = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${wide ? 'field--wide' : ''} ${error ? 'field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__req" aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        list={list}
        aria-invalid={error ? true : undefined}
        aria-describedby={help}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span id={`${id}-err`} className="field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, hint, rows = 4 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="field field--wide">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, placeholder = 'Select' }: {
  label: string;
  value: T;
  options: readonly string[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One choice from a few. Clicking the chosen option again clears it, since every one is optional. */
export function Segmented<T extends string>({ label, value, options, onChange, wide }: {
  label: ReactNode;
  value: T;
  options: readonly string[];
  onChange: (value: T) => void;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field ${wide ? 'field--wide' : ''}`}>
      <span className="field__label" id={id}>
        {label}
      </span>
      <div className="choice" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            type="button"
            key={o}
            className={`choice__btn ${value === o ? 'is-on' : ''} ${o === 'Prefer not to say' ? 'choice__btn--quiet' : ''}`}
            aria-pressed={value === o}
            onClick={() => onChange((value === o ? '' : o) as T)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Several choices; "Prefer not to say" stands alone. */
export function MultiChoice({ label, values, options, onChange }: {
  label: string;
  values: string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const quiet = 'Prefer not to say';
  function toggle(option: string) {
    if (values.includes(option)) return onChange(values.filter((v) => v !== option));
    if (option === quiet) return onChange([quiet]);
    onChange([...values.filter((v) => v !== quiet), option]);
  }
  return (
    <div className="field field--wide">
      <span className="field__label" id={id}>
        {label} <span className="field__aside">Any that apply</span>
      </span>
      <div className="choice" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            type="button"
            key={o}
            className={`choice__btn ${values.includes(o) ? 'is-on' : ''} ${o === quiet ? 'choice__btn--quiet' : ''}`}
            aria-pressed={values.includes(o)}
            onClick={() => toggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Free tags: Enter or comma adds one, the x removes it, Backspace on an empty box removes the last. */
export function TagInput({ label, values, onChange, placeholder, suggestions = [], hint }: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  hint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const part of parts) {
      if (!seen.has(part.toLowerCase())) {
        next.push(part);
        seen.add(part.toLowerCase());
      }
    }
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
      setDraft('');
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (text.includes(',') || text.includes('\n')) {
      event.preventDefault();
      add(text.replace(/\n/g, ','));
    }
  }

  const open = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className="field field--wide">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="tags">
        {values.map((v) => (
          <span className="tags__item" key={v}>
            {v}
            <button type="button" className="tags__x" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <IconX size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="tags__input"
          value={draft}
          placeholder={values.length === 0 ? placeholder : 'Add'}
          onChange={(e) => {
            const value = e.target.value;
            if (value.endsWith(',')) {
              add(value);
              setDraft('');
            } else {
              setDraft(value);
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            add(draft);
            setDraft('');
          }}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      </div>
      {open.length > 0 ? (
        <div className="tags__suggest">
          <span className="field__aside">Suggested</span>
          {open.map((s) => (
            <button type="button" key={s} className="pill-btn pill-btn--sm" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A month input can only show YYYY-MM. Anything else (a bare year read from a resume) stays visible as text to fix. */
function monthType(value: string): 'month' | 'text' {
  return value === '' || /^\d{4}-\d{2}$/.test(value) ? 'month' : 'text';
}

/** Start and end months, with "Present" for an end that has not happened yet. */
export function MonthRange({ start, end, onChange, presentLabel }: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  presentLabel: string;
}) {
  const id = useId();
  const present = end === PRESENT;
  return (
    <div className="months field--wide">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-s`}>
          Start
        </label>
        <input
          id={`${id}-s`}
          className="input"
          type={monthType(start)}
          placeholder="YYYY-MM"
          value={start}
          onChange={(e) => onChange(e.target.value, end)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-e`}>
          End
        </label>
        <input
          id={`${id}-e`}
          className="input"
          type={present ? 'text' : monthType(end)}
          placeholder="YYYY-MM"
          value={present ? PRESENT : end}
          disabled={present}
          onChange={(e) => onChange(start, e.target.value)}
        />
      </div>
      <label className="check check--text">
        <input type="checkbox" checked={present} onChange={(e) => onChange(start, e.target.checked ? PRESENT : '')} />
        <CheckBox />
        <span>{presentLabel}</span>
      </label>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="wsection">
      <legend className="wsection__title">
        {title}
        {aside ? <span className="wsection__aside">{aside}</span> : null}
      </legend>
      <div className="grid-fields">{children}</div>
    </fieldset>
  );
}
