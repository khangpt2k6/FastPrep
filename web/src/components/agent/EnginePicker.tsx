// The choice of the AI that does a piece of work, made easy to see: a tile per engine with its logo, its name and what it
// runs on. The chosen tile is lit in its brand's colour. Used for Tasks (Claude Code or Codex) and the agent's own engine.
import { BrandLogo, type Brand } from '../BrandLogo';
import { IconCheck } from '../Icons';
import './engines.css';

export interface EngineOption<T extends string> {
  value: T;
  brand: Brand;
  name: string;
  /** What it runs on, in a few words: "Your ChatGPT plan". */
  note: string;
}

export function EnginePicker<T extends string>({ value, options, onChange, label, disabled = false }: {
  value: T;
  options: EngineOption<T>[];
  onChange: (value: T) => void;
  /** The choice's name, for screen readers. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="engines" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            className={`engine engine--${option.brand} ${on ? 'is-on' : ''}`}
            onClick={() => onChange(option.value)}
          >
            <span className="engine__logo">
              <BrandLogo brand={option.brand} size={22} />
            </span>
            <span className="engine__text">
              <span className="engine__name">{option.name}</span>
              <span className="engine__note">{option.note}</span>
            </span>
            <span className="engine__check" aria-hidden="true">
              {on ? <IconCheck size={13} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
