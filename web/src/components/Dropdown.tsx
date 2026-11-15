// The platform's default dropdown: a soft frost button that opens a floating glass menu. Options can carry an icon in a
// tinted badge, a status dot, a hint line and a tag; a highlight slides between them. Optional actions sit under the
// list ("New template"). Arrow keys, Home and End move, typing a letter jumps, Enter or Space picks, Escape closes.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { menuVariants } from '../lib/motion';
import { IconCheck, IconChevronDown } from './Icons';
import type { Tone } from './shell/pages';
import './dropdown.css';

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  /** A second, gray line in the menu. */
  hint?: string;
  /** Shown in a tinted badge before the label, in the menu and on the button. */
  icon?: ReactNode;
  /** The badge's tint; falls back to the dropdown's tone. */
  tone?: Tone;
  /** A small status dot before the label, for options without an icon. 'hollow' is an empty ring. */
  dot?: Tone | 'hollow';
  /** Trailing content, such as a tag. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface DropdownAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

interface DropdownProps<T extends string | number> {
  value: T | null;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** The control's name, for screen readers. */
  label: string;
  placeholder?: string;
  /** The button's icon when the chosen option has none. */
  icon?: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md';
  /** Fill the width of the parent. */
  block?: boolean;
  /** Which edge the menu lines up with. */
  align?: 'start' | 'end';
  /** Rows under the options that do something instead of choosing. */
  actions?: DropdownAction[];
  disabled?: boolean;
  className?: string;
  /** What the button shows for the chosen option, when it should differ from the menu. */
  display?: (option: DropdownOption<T>) => ReactNode;
}

const ROW = 44;
const MENU_MAX = 340;

function Lead({ icon, tone, dot }: { icon?: ReactNode; tone: Tone; dot?: Tone | 'hollow' }) {
  if (icon) {
    return (
      <span className={`dd__icon ibadge ibadge--sm ibadge--${tone}`} aria-hidden="true">
        {icon}
      </span>
    );
  }
  return dot ? <span className={`dd__dot dd__dot--${dot}`} aria-hidden="true" /> : null;
}

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Choose',
  icon,
  tone = 'ember',
  size = 'md',
  block = false,
  align = 'start',
  actions = [],
  disabled = false,
  className = '',
  display,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const chosen = options.findIndex((o) => o.value === value);
  const current = chosen >= 0 ? options[chosen] : undefined;

  const usable = (i: number) => Boolean(options[i]) && !options[i].disabled;

  function step(from: number, by: 1 | -1): number {
    for (let n = 1; n <= options.length; n += 1) {
      const i = (from + by * n + options.length * n) % options.length;
      if (usable(i)) return i;
    }
    return from;
  }

  function show(index = chosen >= 0 ? chosen : step(-1, 1)) {
    const box = button.current?.getBoundingClientRect();
    const need = Math.min(options.length * ROW + actions.length * 40 + 24, MENU_MAX + actions.length * 40);
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
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    hide();
  }

  function act(action: DropdownAction) {
    hide();
    action.onSelect();
  }

  useEffect(() => {
    if (!open) return;
    const item = items.current[active];
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /** Jump to the next option whose label starts with what was just typed. */
  function typeahead(key: string) {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
    const text = typed.current.text.toLowerCase();
    const start = text.length > 1 ? active : active + 1;
    for (let n = 0; n < options.length; n += 1) {
      const i = (start + n) % options.length;
      if (usable(i) && options[i].label.toLowerCase().startsWith(text)) {
        setActive(i);
        return;
      }
    }
  }

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      show();
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        event.preventDefault();
        setActive(step(options.length, -1));
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
        // With actions under the list, Tab walks into them; otherwise it leaves the menu.
        if (actions.length === 0) setOpen(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
    }
  }

  const shown = current ? (display ? display(current) : current.label) : placeholder;
  const leadIcon = current?.icon ?? icon;
  const classes = ['dd', `dd--${size}`, block ? 'dd--block' : '', align === 'end' ? 'dd--end' : '', className].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      ref={root}
      onBlur={(event) => {
        if (open && !root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={`dd__btn ${leadIcon || current?.dot ? 'has-lead' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? 'not set'}`}
        disabled={disabled}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={onButtonKey}
      >
        <Lead icon={leadIcon} tone={current?.tone ?? tone} dot={leadIcon ? undefined : current?.dot} />
        <span className={`dd__value ${current ? '' : 'is-empty'}`}>{shown}</span>
        {current?.badge ? <span className="dd__badge">{current.badge}</span> : null}
        <span className="dd__chev" aria-hidden="true">
          <IconChevronDown size={15} />
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div className={`dd__menu ${up ? 'is-up' : ''}`} variants={menuVariants} initial="hidden" animate="shown" exit="gone">
            <ul id={listId} role="listbox" aria-label={label} className="dd__list" onKeyDown={onListKey}>
              {options.map((o, i) => {
                const on = o.value === value;
                return (
                  <li
                    key={String(o.value)}
                    ref={(el) => {
                      items.current[i] = el;
                    }}
                    role="option"
                    aria-selected={on}
                    aria-disabled={o.disabled || undefined}
                    tabIndex={i === active ? 0 : -1}
                    className={`dd__opt ${on ? 'is-on' : ''}`}
                    onClick={() => pick(i)}
                    onMouseEnter={() => usable(i) && setActive(i)}
                  >
                    {i === active ? <motion.span className="dd__hl" layoutId={`${listId}-hl`} transition={{ type: 'spring', stiffness: 700, damping: 46 }} aria-hidden="true" /> : null}
                    <Lead icon={o.icon} tone={o.tone ?? tone} dot={o.dot} />
                    <span className="dd__text">
                      <span className="dd__label">{o.label}</span>
                      {o.hint ? <span className="dd__hint">{o.hint}</span> : null}
                    </span>
                    {o.badge ? <span className="dd__badge">{o.badge}</span> : null}
                    <span className="dd__check" aria-hidden="true">
                      {on ? <IconCheck size={15} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {actions.length > 0 ? (
              <div className="dd__foot">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="dd__action"
                    onClick={() => act(a)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        hide();
                      }
                    }}
                  >
                    {a.icon ? (
                      <span className="dd__icon ibadge ibadge--sm ibadge--ember" aria-hidden="true">
                        {a.icon}
                      </span>
                    ) : null}
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default Dropdown;
