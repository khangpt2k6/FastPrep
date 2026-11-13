import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AnswerLength, LoadError, Preferences, PreferencesRow } from '../lib/types';
import { errorText } from '../lib/errors';
import { clock } from '../lib/format';
import { dockVariants } from '../lib/motion';
import { DEFAULT_PREFERENCES, savePreferences, usePreferences } from '../hooks/useAutomationData';
import { IconAlert, IconCheck, IconSpark } from './Icons';
import { Callout, SkeletonRows } from './common';
import { Group, NavRow, PillSelect, SettingRow, ToggleRow, type PillOption } from './settings';
import { SetupCard } from './SetupCard';
import { Wolf } from './mascot/Wolf';

const TONES: PillOption<string>[] = [
  { value: '', label: 'Default' },
  { value: 'Professional', label: 'Professional' },
  { value: 'Warm', label: 'Warm' },
  { value: 'Confident', label: 'Confident' },
  { value: 'Concise', label: 'Concise' },
  { value: 'Enthusiastic', label: 'Enthusiastic' },
];

const LENGTHS: PillOption<AnswerLength>[] = [
  { value: '', label: 'Default' },
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

/** A setting that is a text box: the title and a gray line, then the box inside the card. */
function AreaRow({ title, description, value, onChange, placeholder, rows = 3 }: {
  title: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="srow srow--area">
      <div className="srow__text">
        <label className="srow__title" htmlFor={id}>
          {title}
        </label>
        {description ? (
          <p className="srow__desc" id={`${id}-d`}>
            {description}
          </p>
        ) : null}
      </div>
      <textarea
        id={id}
        className="input textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={description ? `${id}-d` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'error'; message: string };

export interface PreferencesViewProps {
  row: PreferencesRow | null;
  loading: boolean;
  error: LoadError | null;
  reload: () => void;
  save: (prefs: Preferences) => Promise<void>;
  onSaved: () => void;
  onManageMemory: () => void;
}

/** The page's content, after ChatGPT's personalization settings: sections of cards with rows. */
export function PreferencesView({ row, loading, error, reload, save: persist, onSaved, onManageMemory }: PreferencesViewProps) {
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
      await persist(form);
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
      <div className="prefs" aria-busy={loading}>
        {loading ? (
          <>
            <SkeletonRows count={2} />
            <SkeletonRows count={3} />
          </>
        ) : (
          <>
            <Group title="Answer style">
              <SettingRow title="Tone" description="The voice of open answers.">
                <PillSelect label="Tone" value={form.tone} options={TONES.some((t) => t.value === form.tone) ? TONES : [...TONES, { value: form.tone, label: form.tone }]} onChange={(v) => set('tone', v)} />
              </SettingRow>
              <SettingRow title="Length" description="Answer length.">
                <PillSelect<AnswerLength> label="Length" value={form.length} options={LENGTHS} onChange={(v) => set('length', v)} />
              </SettingRow>
            </Group>

            <Group title="Custom instructions">
              <AreaRow title="Emphasize" description="Topics to highlight." value={form.highlight} onChange={(v) => set('highlight', v)} placeholder="AI agents, distributed systems" />
              <AreaRow title="Forbidden" description="Topics to avoid." value={form.avoid} onChange={(v) => set('avoid', v)} placeholder="Salary expectations" />
              <AreaRow title="Notes" description="Other writing instructions." value={form.notes} onChange={(v) => set('notes', v)} placeholder="First person, American spelling" />
              <AreaRow title="Writing sample" description="Used to match your style." value={form.sample} onChange={(v) => set('sample', v)} placeholder="Paste an answer you wrote" rows={5} />
            </Group>

            <Group title="Memory">
              <ToggleRow title="Learn from answers" description="Save new answers to Memory." checked={form.learn} onChange={(v) => set('learn', v)} />
              <NavRow title="Saved answers" description="View, pin and edit saved answers." onClick={onManageMemory} />
            </Group>
          </>
        )}
      </div>

      <aside className="prefs-side">
        <section className="card preview" aria-labelledby="preview-title">
          <div className="preview__head">
            <Wolf mood="reading" size={40} motion="none" />
            <p className="preview__label" id="preview-title">
              Preview
            </p>
          </div>
          <p className="preview__q">Why are you interested in this role?</p>
          <div className="preview__tags">
            {summary(form).map((s) => (
              <span className="chip" key={s}>
                {s}
              </span>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.blockquote key={form.length || 'default'} className="preview__a" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {example}
            </motion.blockquote>
          </AnimatePresence>
          <p className="preview__note" title="Each form gets a fresh answer">
            <IconSpark size={14} />
            Example only
          </p>
        </section>
      </aside>

      <AnimatePresence>
        {dirty || save.state === 'saving' || save.state === 'error' ? (
          <motion.div className="savebar" role="region" aria-label="Unsaved changes" variants={dockVariants} initial="hidden" animate="shown" exit="gone">
            <span className={`savestate savestate--${save.state}`} role="status" aria-live="polite">
              {save.state === 'saving' ? 'Saving' : save.state === 'error' ? `Not saved: ${save.message}` : 'Unsaved changes'}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setForm(JSON.parse(baseline) as Preferences);
                setSave({ state: 'idle' });
              }}
              disabled={save.state === 'saving'}
            >
              Discard
            </button>
            <button type="button" className="btn btn--brand btn--sm" onClick={submit} disabled={!dirty || save.state === 'saving'}>
              {save.state === 'saving' ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
              Save
            </button>
          </motion.div>
        ) : save.state === 'saved' ? (
          <motion.p key="saved" className="savedline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <IconCheck size={14} /> Saved {clock(save.at)}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The page wired to Supabase. */
export function PreferencesPage({ userId, onSaved, onManageMemory }: { userId: string; onSaved: () => void; onManageMemory: () => void }) {
  const { row, loading, error, reload } = usePreferences(userId);
  return <PreferencesView row={row} loading={loading} error={error} reload={() => void reload()} save={savePreferences} onSaved={onSaved} onManageMemory={onManageMemory} />;
}

export default PreferencesPage;
