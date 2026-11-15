// Which model a plan's engine (Codex or Claude Code) uses, and how hard it thinks, picked the way an AI tool picks it: a
// button with the model and the effort, opening a menu of the models this computer's engine offers, each with a line about
// it, and an effort track under them. The engine's own default stays the first choice.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { ModelCatalog, ModelInfo } from '../../lib/types';
import { BrandLogo } from '../BrandLogo';
import { IconCheck, IconChevronDown } from '../Icons';
import './modelpicker.css';

export type PlanEngine = 'codex' | 'claude';

const EFFORT_NAME: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra' };
const DEFAULT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// What the page offers when the agent has not said what this computer has (an older agent, or one not started yet).
export const FALLBACK: Required<ModelCatalog> = {
  codex: [
    { id: 'gpt-6.1-sol', name: 'GPT-6.1-Sol', description: 'Latest workhorse model for coding and everyday work.', efforts: [...DEFAULT_EFFORTS, 'ultra'], effort: 'low' },
    { id: 'gpt-6-astra', name: 'GPT-6-Astra', description: 'Frontier intelligence for the most demanding work.', efforts: [...DEFAULT_EFFORTS, 'ultra'], effort: 'low' },
    { id: 'gpt-6-luna', name: 'GPT-6-Luna', description: 'Fast and affordable model for easier tasks.', efforts: DEFAULT_EFFORTS, effort: 'medium' },
  ],
  claude: [
    { id: 'claude-opus-5-5', name: 'Opus 5.5', description: 'For complex work and everyday tasks', efforts: DEFAULT_EFFORTS, effort: '' },
    { id: 'claude-fable-5-2', name: 'Fable 5.2', description: 'For your toughest challenges', efforts: DEFAULT_EFFORTS, effort: '' },
    { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', description: 'Most efficient for simpler tasks', efforts: DEFAULT_EFFORTS, effort: '' },
    { id: 'claude-haiku-5-5', name: 'Haiku 5.5', description: 'Fastest for quick answers', efforts: DEFAULT_EFFORTS, effort: '' },
  ],
};

/** The models an engine offers here: the agent's list, or the page's own when it has none. */
export function modelsOf(engine: PlanEngine, catalog: ModelCatalog | null | undefined): ModelInfo[] {
  const listed = catalog?.[engine];
  return Array.isArray(listed) && listed.length ? listed : FALLBACK[engine];
}

export function modelLabel(models: ModelInfo[], model: string, effort: string): string {
  const name = models.find((m) => m.id === model)?.name ?? (model || 'Default');
  return effort ? `${name} · ${EFFORT_NAME[effort] ?? effort}` : name;
}

export function ModelPicker({ engine, catalog, model, effort, onChange, disabled = false, compact = false }: {
  engine: PlanEngine;
  catalog?: ModelCatalog | null;
  model: string;
  effort: string;
  onChange: (model: string, effort: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const models = modelsOf(engine, catalog);
  const chosen = models.find((m) => m.id === model);
  const efforts = (chosen?.efforts?.length ? chosen.efforts : DEFAULT_EFFORTS).filter((e) => e in EFFORT_NAME);
  // The effort shown on the track: the one picked, else the model's own.
  const shown = effort || chosen?.effort || '';

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const where = () => {
      const box = button.current!.getBoundingClientRect();
      const width = Math.max(box.width, 320);
      const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
      const below = window.innerHeight - box.bottom;
      setPlace(below > 380 || below > box.top ? { left, top: box.bottom + 6, width } : { left, bottom: window.innerHeight - box.top + 6, width });
    };
    where();
    window.addEventListener('resize', where);
    window.addEventListener('scroll', where, true);
    return () => {
      window.removeEventListener('resize', where);
      window.removeEventListener('scroll', where, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const pick = (id: string) => {
    // A model that does not take the effort picked goes back to its own.
    const next = models.find((m) => m.id === id);
    onChange(id, effort && next && next.efforts.length && !next.efforts.includes(effort) ? '' : effort);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`mpick ${compact ? 'mpick--compact' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title="Model and effort"
      >
        <BrandLogo brand={engine === 'claude' ? 'claude' : 'openai'} size={15} />
        <span className="mpick__label">{modelLabel(models, model, effort)}</span>
        <IconChevronDown size={14} className={open ? 'is-flipped' : ''} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && place ? (
            <motion.div
              ref={menu}
              className="mmenu"
              role="dialog"
              aria-label="Select a model"
              style={{ left: place.left, top: place.top, bottom: place.bottom, width: place.width }}
              initial={{ opacity: 0, y: place.top !== undefined ? -6 : 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mmenu__head">Select a model</p>
              <ul className="mmenu__list" role="listbox" aria-label="Models">
                {[{ id: '', name: 'Default (recommended)', description: `${engine === 'claude' ? 'Claude Code' : 'Codex'} picks its own`, efforts: [], effort: '' }, ...models].map((m) => (
                  <li key={m.id || 'default'}>
                    <button type="button" role="option" aria-selected={m.id === model} className={`mmenu__item ${m.id === model ? 'is-on' : ''}`} onClick={() => pick(m.id)}>
                      <span className="mmenu__text">
                        <span className="mmenu__name">{m.name}</span>
                        <span className="mmenu__about">{m.description}</span>
                      </span>
                      {m.id === model ? <IconCheck size={16} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mmenu__effort">
                <span className="mmenu__elabel">
                  Effort <span className="mmenu__evalue">({shown ? EFFORT_NAME[shown] ?? shown : 'Default'})</span>
                </span>
                <div className="etrack" role="radiogroup" aria-label="Effort" style={{ ['--steps' as string]: efforts.length }}>
                  <span
                    className="etrack__fill"
                    style={{ width: shown && efforts.includes(shown) ? `calc(${efforts.indexOf(shown)} / ${Math.max(1, efforts.length - 1)} * (100% - 18px) + 18px)` : '0' }}
                  />
                  {efforts.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={level === effort}
                      aria-label={EFFORT_NAME[level]}
                      title={EFFORT_NAME[level]}
                      className={`etrack__dot ${shown && efforts.indexOf(level) <= efforts.indexOf(shown) ? 'is-on' : ''} ${level === shown ? 'is-at' : ''}`}
                      onClick={() => onChange(model, level === effort ? '' : level)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
