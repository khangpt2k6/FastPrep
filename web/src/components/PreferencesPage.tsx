import { useEffect, useId, useState } from 'react';
import type { AnswerLength, Preferences } from '../lib/types';
import { errorText } from '../lib/errors';
import { clock } from '../lib/format';
import { DEFAULT_PREFERENCES, savePreferences, usePreferences } from '../hooks/useAutomationData';
import { IconAlert, IconCheck, IconSpark } from './Icons';
import { Callout } from './common';
import { SetupCard } from './SetupCard';

const TONES = ['Professional', 'Warm', 'Confident', 'Concise', 'Enthusiastic'];

const LENGTHS: { value: Exclude<AnswerLength, ''>; label: string; hint: string }[] = [
  { value: 'Short', label: 'Short', hint: '1 to 2 sentences' },
  { value: 'Medium', label: 'Medium', hint: '3 to 5 sentences' },
  { value: 'Detailed', label: 'Detailed', hint: 'Up to 150 words' },
];

/** Illustrations only: the agent writes a fresh answer for every form. */
const EXAMPLES: Record<Exclude<AnswerLength, ''> | 'default', (focus: string) => string> = {
  Short: (focus) => `The team ships things people use every day, and this role is a direct fit for my work on ${focus}.`,
  default: (focus) =>
    `I want to work where my work reaches real users quickly. Your team ships often and cares about quality, and my experience with ${focus} lines up with what this role needs. I would like to keep growing on a team like that.`,
  Medium: (focus) =>
    `I want to work where my work reaches real users quickly. Your team ships often and cares about quality, and my experience with ${focus} lines up with what this role needs. I learn fast and I like owning a problem end to end. This role would let me do both from the first week.`,
  Detailed: (focus) =>
    `I want to work where my work reaches real users quickly, and that is what drew me to this team. My recent projects centered on ${focus}, from the first prototype to a version people relied on every day. I enjoy the unglamorous parts too: writing tests, reading logs and fixing the thing that broke at the worst time. The role asks for someone who can learn a new codebase and own a piece of it, which is how I have worked on every team so far. I would bring that habit here and grow with the people around me.`,
};

function firstPhrase(text: string): string {
  return text.split(/[,\n;]/)[0]?.trim() ?? '';
}

function summary(p: Preferences): string[] {
  const parts: string[] = [];
  parts.push(p.tone || 'Default tone');
  parts.push(p.length || 'Default length');
  if (p.highlight.trim()) parts.push(`Emphasize: ${firstPhrase(p.highlight)}`);
  if (p.avoid.trim()) parts.push(`Forbidden: ${firstPhrase(p.avoid)}`);
  if (p.sample.trim()) parts.push('Matches sample');
  return parts;
}

function pick(p: Partial<Preferences> | null): Preferences {
  if (!p) return { ...DEFAULT_PREFERENCES };
  const length = p.length === 'Short' || p.length === 'Medium' || p.length === 'Detailed' ? p.length : '';
  return {
    tone: p.tone ?? '',
    length,
    highlight: p.highlight ?? '',
    avoid: p.avoid ?? '',
    notes: p.notes ?? '',
    sample: p.sample ?? '',
    learn: p.learn ?? true,
  };
}

function Area({ label, value, onChange, placeholder, hint, rows = 3 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'error'; message: string };

export function PreferencesPage({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const { row, loading, error, reload } = usePreferences(userId);
  const [form, setForm] = useState<Preferences>(() => pick(null));
  const [baseline, setBaseline] = useState(() => JSON.stringify(pick(null)));
  const [save, setSave] = useState<SaveState>({ state: 'idle' });

  useEffect(() => {
    if (loading) return;
    const loaded = pick(row);
    setForm(loaded);
    setBaseline(JSON.stringify(loaded));
  }, [row, loading]);

  const dirty = JSON.stringify(form) !== baseline;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setSave({ state: 'saving' });
    try {
      await savePreferences(form);
      setBaseline(JSON.stringify(form));
      setSave({ state: 'saved', at: Date.now() });
      onSaved();
      void reload();
    } catch (err) {
      setSave({ state: 'error', message: errorText(err) });
    }
  }

  if (error?.kind === 'missing-table') return <SetupCard table="automation_preferences" />;
  if (error) {
    return (
      <Callout
        tone="red"
        icon={<IconAlert size={16} />}
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void reload()}>
            Retry
          </button>
        }
      >
        {error.message}
      </Callout>
    );
  }

  const focus = firstPhrase(form.highlight) || 'building reliable software';
  const example = EXAMPLES[form.length || 'default'](focus);

  return (
    <div className="page page--prefs">
      <section className="prefs" aria-label="Answer preferences" aria-busy={loading}>
        <div className="field">
          <span className="field__label" id="tone-label">
            Tone
          </span>
          <div className="choice" role="group" aria-labelledby="tone-label">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                className={`choice__btn ${form.tone === t ? 'is-on' : ''}`}
                aria-pressed={form.tone === t}
                onClick={() => set('tone', form.tone === t ? '' : t)}
              >
                {form.tone === t ? <IconCheck size={14} /> : null}
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label" id="length-label">
            Length
          </span>
          <div className="segments" role="group" aria-labelledby="length-label">
            {LENGTHS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`segment ${form.length === l.value ? 'is-on' : ''}`}
                aria-pressed={form.length === l.value}
                onClick={() => set('length', form.length === l.value ? '' : l.value)}
              >
                <span className="segment__label">{l.label}</span>
                <span className="segment__hint">{l.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="prefs__grid">
          <Area
            label="Emphasize"
            value={form.highlight}
            onChange={(v) => set('highlight', v)}
            placeholder="AI agents, distributed systems"
          />
          <Area
            label="Forbidden"
            value={form.avoid}
            onChange={(v) => set('avoid', v)}
            placeholder="Salary expectations"
          />
        </div>
        <Area label="Notes" value={form.notes} onChange={(v) => set('notes', v)} placeholder="First person, American spelling" />
        <Area
          label="Writing sample"
          value={form.sample}
          onChange={(v) => set('sample', v)}
          placeholder="Paste an answer you wrote"
          hint="Used to match your style"
          rows={5}
        />

        <label className="row-switch row-switch--card">
          <span className="row-switch__text">
            <strong>Learn from answers</strong>
            <span>Save new answers to Memory</span>
          </span>
          <input type="checkbox" role="switch" checked={form.learn} onChange={(e) => set('learn', e.target.checked)} />
          <span className="switch" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
        </label>

        <footer className="prefs__foot">
          <span className={`savestate savestate--${save.state}`} role="status" aria-live="polite">
            {save.state === 'saving'
              ? 'Saving'
              : save.state === 'error'
                ? `Not saved: ${save.message}`
                : dirty
                  ? 'Unsaved changes'
                  : save.state === 'saved'
                    ? `Saved ${clock(save.at)}`
                    : row
                      ? 'Saved'
                      : 'Defaults'}
          </span>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!dirty || save.state === 'saving' || loading}>
            {save.state === 'saving' ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
            Save
          </button>
        </footer>
      </section>

      <aside className="prefs-side">
        <section className="preview" aria-labelledby="preview-title">
          <p className="section__label" id="preview-title">
            Preview
          </p>
          <p className="preview__q">Why are you interested in this role?</p>
          <div className="preview__tags">
            {summary(form).map((s) => (
              <span className="softchip" key={s}>
                {s}
              </span>
            ))}
          </div>
          <blockquote className="preview__a">{example}</blockquote>
          <p className="preview__note" title="Each form gets a fresh answer">
            <IconSpark size={14} />
            Example only
          </p>
        </section>
      </aside>
    </div>
  );
}
