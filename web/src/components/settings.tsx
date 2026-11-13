// The settings-card language, after ChatGPT's settings: a section title over a white card of rows, each row a title
// and a gray line on the left with its control on the right (a toggle, a pill dropdown, a pill button or a chevron).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { menuVariants } from '../lib/motion';
import { IconCheck, IconChevronDown, IconChevronRight } from './Icons';

/** A titled group: the heading, an optional aside on the right, then a white card (or bare content). */
export function Group({ title, aside, children, bare = false, className = '' }: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** No card around the content, for grids of their own. */
  bare?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`group ${className}`} aria-labelledby={id}>
      <div className="group__head">
        <h2 className="group__title" id={id}>
          {title}
        </h2>
        {aside ? <div className="group__aside">{aside}</div> : null}
      </div>
      {bare ? children : <div className="panel">{children}</div>}
    </section>
  );
}

/** One setting: title and description on the left, its control on the right. */
export function SettingRow({ title, description, children, className = '' }: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`srow ${className}`}>
      <div className="srow__text">
        <p className="srow__title">{title}</p>
        {description ? <p className="srow__desc">{description}</p> : null}
      </div>
      {children ? <div className="srow__control">{children}</div> : null}
    </div>
  );
}

/** An iOS-like switch: ChatGPT blue when on, a white knob that springs across. */
export function Switch({ checked, onChange, label, disabled, describedBy, id }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  describedBy?: string;
  id?: string;
}) {
  return (
    <span className={`switchbox ${disabled ? 'is-disabled' : ''}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </span>
  );
}

/** A setting that is a switch: the whole row toggles it. */
export function ToggleRow({ title, description, checked, onChange, disabled, className = '' }: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={`srow srow--toggle ${disabled ? 'is-disabled' : ''} ${className}`} htmlFor={id}>
      <span className="srow__text">
        <span className="srow__title">{title}</span>
        {description ? (
          <span className="srow__desc" id={`${id}-desc`}>
            {description}
          </span>
        ) : null}
      </span>
      <span className="srow__control">
        <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} describedBy={description ? `${id}-desc` : undefined} />
      </span>
    </label>
  );
}

/** A row that opens something: the whole row is the button, with a chevron on the right. */
export function NavRow({ title, description, onClick, icon }: { title: string; description?: ReactNode; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" className="srow srow--nav" onClick={onClick}>
      {icon ? (
        <span className="srow__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="srow__text">
        <span className="srow__title">{title}</span>
        {description ? <span className="srow__desc">{description}</span> : null}
      </span>
      <span className="srow__control srow__chev" aria-hidden="true">
        <IconChevronRight size={16} />
      </span>
    </button>
  );
}

export interface PillOption<T extends string | number> {
  value: T;
  label: string;
  /** A gray second line in the menu. */
  hint?: string;
}

/**
 * A pill dropdown like ChatGPT's "Default v": a button that opens a small menu with a check on the chosen option.
 * Arrow keys, Home and End move, Enter or Space picks, Escape closes and gives focus back.
 */
export function PillSelect<T extends string | number>({ value, options, onChange, label, disabled, display }: {
  value: T;
  options: PillOption<T>[];
  onChange: (value: T) => void;
  /** The setting's name, for screen readers. */
  label: string;
  disabled?: boolean;
  /** What the pill says for a value, when it should read differently from the menu ("3h" for "Every 3 hours"). */
  display?: (option: PillOption<T>) => string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const listId = useId();
  const chosen = options.findIndex((o) => o.value === value);
  const current = options[chosen];
  const shown = current ? (display ? display(current) : current.label) : 'Choose';

  function show(index = Math.max(0, chosen)) {
    const box = button.current?.getBoundingClientRect();
    const need = options.length * 40 + 16;
    setUp(Boolean(box && box.bottom + need > window.innerHeight - 12 && box.top > need));
    setActive(index);
    setOpen(true);
  }

  function hide(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function pick(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    hide();
  }

  useEffect(() => {
    if (open) items.current[active]?.focus({ preventScroll: true });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      show();
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => (i <= 0 ? last : i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(active);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        hide();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  return (
    <div className="pselect" ref={root}>
      <button
        ref={button}
        type="button"
        className="pselect__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? 'not set'}`}
        disabled={disabled}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={onButtonKey}
      >
        <span className="pselect__value">{shown}</span>
        <IconChevronDown size={14} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={label}
            className={`menu pselect__menu ${up ? 'is-up' : ''}`}
            variants={menuVariants}
            initial="hidden"
            animate="shown"
            exit="gone"
            onKeyDown={onListKey}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                ref={(el) => {
                  items.current[i] = el;
                }}
                role="option"
                aria-selected={o.value === value}
                tabIndex={i === active ? 0 : -1}
                className={`pselect__opt ${o.value === value ? 'is-on' : ''}`}
                onClick={() => pick(i)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="pselect__text">
                  <span>{o.label}</span>
                  {o.hint ? <span className="pselect__hint">{o.hint}</span> : null}
                </span>
                <span className="pselect__check" aria-hidden="true">
                  {o.value === value ? <IconCheck size={15} /> : null}
                </span>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** A one-line gray note under a card, such as when a setting needs a newer database. */
export function GroupNote({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' }) {
  return <p className={`groupnote groupnote--${tone}`}>{children}</p>;
}
