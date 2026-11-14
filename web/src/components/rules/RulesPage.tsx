import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DEFAULT_TEMPLATE, pieces, type CoverSettings, type CoverTemplate } from '../../lib/coverLetter';
import { errorText } from '../../lib/errors';
import { ANSWER_KINDS, ALWAYS_BUILTIN, alwaysRuleId, answerRuleId, bySort, headline, letterRuleId, sectionRuleId, slotTitle, type RuleRow, type RuleWrite } from '../../lib/rules';
import type { LiveTable } from '../../hooks/useLiveTable';
import { useCoverSettings, useCoverTemplates } from '../../hooks/useCoverLetters';
import { deleteRule, resetRule, saveRule, useRules } from '../../hooks/useRules';
import type { Page } from '../../hooks/useRoute';
import { SkeletonRows } from '../common';
import { Group, GroupNote, Switch } from '../settings';
import { IconChat, IconCheck, IconChevronDown, IconHash, IconLetter, IconPencil, IconPlus, IconRepeat, IconRules, IconSpark, IconTrash } from '../Icons';
import type { ToastInput } from '../Toasts';

export interface RulesData {
  rules: LiveTable<RuleRow>;
  templates: LiveTable<CoverTemplate>;
  settings: { settings: CoverSettings | null; loading: boolean };
}

export interface RulesActions {
  save: (rule: RuleWrite) => Promise<void>;
  reset: (rule: RuleRow) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

interface RulesViewProps {
  data: RulesData;
  actions: RulesActions;
  toast: (toast: ToastInput) => void;
  onNavigate: (page: Page) => void;
}

/** Runs a write with a busy flag and a toast for the outcome. */
function useRun(toast: RulesViewProps['toast']) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, action: () => Promise<void>, done?: string): Promise<boolean> {
    setBusy(key);
    try {
      await action();
      if (done) toast({ tone: 'ok', title: done });
      return true;
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save the rule', detail: errorText(error) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

/** A text box with Save and Cancel that appear once it differs from what is stored. */
function RuleText({ value, placeholder, label, readOnly, busy, onSave, rows = 3, alwaysOpen = false }: {
  value: string;
  placeholder?: string;
  label: string;
  readOnly: boolean;
  busy: boolean;
  onSave: (text: string) => void;
  rows?: number;
  alwaysOpen?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const dirty = text.trim() !== value.trim();
  return (
    <div className="rulebox">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="input textarea" rows={rows} value={text} placeholder={placeholder} readOnly={readOnly} onChange={(e) => setText(e.target.value)} />
      <AnimatePresence initial={false}>
        {dirty || alwaysOpen ? (
          <motion.div className="rulebox__bar" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setText(value)} disabled={busy || !dirty}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave(text.trim())} disabled={busy || readOnly || !dirty}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
              Save
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function LetterRule({ rule, readOnly, busy, run, actions }: { rule: RuleRow; readOnly: boolean; busy: string | null; run: ReturnType<typeof useRun>['run']; actions: RulesActions }) {
  const [editing, setEditing] = useState(false);
  const edited = rule.updated_by === 'web';
  const changed = rule.builtin && rule.default_body !== '' && rule.body !== rule.default_body;
  const write = (patch: Partial<RuleWrite>) => ({ id: rule.id, kind: rule.kind, title: rule.title, description: rule.description, body: rule.body, enabled: rule.enabled, ...patch });
  return (
    <div className={`srow srow--rule ${rule.enabled ? '' : 'is-off'}`}>
      <div className="srow__main">
        <div className="srow__text">
          <p className="srow__title">
            <span className="srow__name">{rule.title}</span>
            {!rule.enabled ? <span className="tag tag--gray">Off</span> : null}
            {edited ? <span className="tag tag--ember">Edited</span> : null}
            {!rule.builtin ? <span className="tag tag--gray">Yours</span> : null}
          </p>
          {rule.description ? <p className="srow__desc">{rule.description}</p> : null}
        </div>
        <div className="srow__tools">
          {!readOnly ? (
            <button type="button" className={`btn btn--ghost btn--sm ${editing ? 'is-on' : ''}`} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              <IconPencil size={14} />
              {editing ? 'Close' : 'Edit'}
            </button>
          ) : null}
          {rule.builtin && (edited || changed) && !readOnly ? (
            <button type="button" className="btn btn--ghost btn--sm" title="Put back the text the agent shipped" disabled={busy === rule.id} onClick={() => void run(rule.id, () => actions.reset(rule), 'Rule reset')}>
              <IconRepeat size={14} />
              Reset
            </button>
          ) : null}
          {!rule.builtin && !readOnly ? (
            <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${rule.title}`} title="Delete" onClick={() => void run(rule.id, () => actions.remove(rule.id), 'Rule deleted')}>
              <IconTrash size={15} />
            </button>
          ) : null}
        </div>
        <div className="srow__switch">
          <Switch checked={rule.enabled} label={`${rule.title}, on`} disabled={readOnly} onChange={(on) => void run(rule.id, () => actions.save(write({ enabled: on })))} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div className="srow__more" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <RuleText
              value={rule.body}
              label={`${rule.title}, the rule`}
              readOnly={readOnly}
              busy={busy === rule.id}
              rows={4}
              onSave={(body) =>
                void run(rule.id, () => actions.save(write({ body })), 'Rule saved').then((ok) => {
                  if (ok) setEditing(false);
                })
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** An inline form for a new rule: a title, a line about it, and the rule itself. */
function NewRule({ withDescription, onCreate, onCancel, busy, placeholder }: {
  withDescription: boolean;
  onCreate: (rule: { title: string; description: string; body: string }) => void;
  onCancel: () => void;
  busy: boolean;
  placeholder: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const id = useId();
  const ok = (withDescription ? title.trim() : true) && body.trim();
  return (
    <motion.div className="srow srow--new" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="newrule">
        {withDescription ? (
          <div className="grid-fields">
            <div className="field">
              <label className="field__label" htmlFor={`${id}-t`}>
                Title
              </label>
              <input id={`${id}-t`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mention the hackathon" autoFocus />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-d`}>
                Purpose
              </label>
              <input id={`${id}-d`} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line, for this page" />
            </div>
          </div>
        ) : null}
        <div className="field">
          <label className="field__label" htmlFor={`${id}-b`}>
            The rule
          </label>
          <textarea id={`${id}-b`} className="input textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} autoFocus={!withDescription} />
        </div>
        <div className="rulebox__bar">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--brand btn--sm" disabled={!ok || busy} onClick={() => onCreate({ title: title.trim() || headline(body), description: description.trim(), body: body.trim() })}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <IconPlus size={14} />}
            Add rule
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** The page's content. The container below wires it to Supabase; the preview feeds it mock rows. */
export function RulesView({ data, actions, toast, onNavigate }: RulesViewProps) {
  const { rules: rulesT, templates: templatesT, settings } = data;
  const { busy, run } = useRun(toast);
  const [adding, setAdding] = useState<'letter' | 'always' | null>(null);
  const [newKinds, setNewKinds] = useState<string[]>([]);
  const [kindDraft, setKindDraft] = useState('');
  const [builtinOpen, setBuiltinOpen] = useState(false);
  const readOnly = rulesT.error?.kind === 'missing-table';

  const rules = rulesT.rows;
  const letterRules = useMemo(() => rules.filter((r) => r.kind === 'cover_letter').sort(bySort), [rules]);
  const answerRules = useMemo(() => new Map(rules.filter((r) => r.kind === 'answer').map((r) => [r.id, r])), [rules]);
  const sectionRules = useMemo(() => new Map(rules.filter((r) => r.kind === 'section').map((r) => [r.id, r])), [rules]);
  const builtinAlways = rules.find((r) => r.id === ALWAYS_BUILTIN) ?? null;
  const ownAlways = useMemo(() => rules.filter((r) => r.kind === 'always' && r.id !== ALWAYS_BUILTIN).sort(bySort), [rules]);

  // The template in use and its generated parts, each with the template's own note.
  const templateId = settings.settings?.template_id ?? DEFAULT_TEMPLATE;
  const template = templatesT.rows.find((t) => t.id === templateId) ?? templatesT.rows.find((t) => t.id === DEFAULT_TEMPLATE) ?? null;
  const slots = useMemo(() => {
    const seen = new Map<string, string>();
    for (const piece of template ? pieces(template.body) : []) if (piece.kind === 'slot' && !seen.has(piece.name)) seen.set(piece.name, piece.instruction);
    return [...seen.entries()];
  }, [template]);

  // Preset kinds of questions, then any the person added before, then ones added on this visit.
  const answerKinds = useMemo(() => {
    const presets = ANSWER_KINDS.map((k, i) => ({ id: answerRuleId(k.title), title: k.title, example: k.example, sort: i }));
    const known = new Set(presets.map((p) => p.id));
    const stored = [...answerRules.values()].filter((r) => !known.has(r.id)).sort(bySort).map((r) => ({ id: r.id, title: r.title, example: '', sort: r.sort }));
    const fresh = newKinds.map((title, i) => ({ id: answerRuleId(title), title, example: '', sort: 50 + i })).filter((k) => !known.has(k.id) && !answerRules.has(k.id));
    return [...presets, ...stored, ...fresh];
  }, [answerRules, newKinds]);

  if (rulesT.loading) {
    return (
      <div className="page page--rules">
        <SkeletonRows count={4} />
        <SkeletonRows count={3} />
      </div>
    );
  }

  // The explanation lives in the title's tooltip; the page shows the label only.
  const header = (title: string, sub: string) => (
    <span className="group__titlewrap" title={sub}>
      {title}
    </span>
  );

  const content: ReactNode = (
    <>
      <Group
        title={header('Cover letter rules', 'How every letter is written.')}
        icon={<IconLetter size={15} />}
        tone="sand"
        aside={
          !readOnly ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdding(adding === 'letter' ? null : 'letter')}>
              <IconPlus size={14} />
              Add a rule
            </button>
          ) : null
        }
      >
        {adding === 'letter' ? (
          <NewRule
            withDescription
            busy={busy === 'new-letter'}
            placeholder="Mention the USF hackathon when the team builds developer tools."
            onCancel={() => setAdding(null)}
            onCreate={(r) =>
              void run('new-letter', () => actions.save({ id: letterRuleId(r.title), kind: 'cover_letter', title: r.title, description: r.description, body: r.body, enabled: true, builtin: false, sort: 9 }), 'Rule added').then(
                (ok) => ok && setAdding(null),
              )
            }
          />
        ) : null}
        {letterRules.length === 0 && adding !== 'letter' ? <p className="srow__empty">The agent adds its rules here the next time it starts.</p> : null}
        {letterRules.map((rule) => (
          <LetterRule key={rule.id} rule={rule} readOnly={readOnly} busy={busy} run={run} actions={actions} />
        ))}
      </Group>

      <Group icon={<IconHash size={15} />} tone="pine" title={header('Letter sections', template ? `The generated parts of "${template.name}", the template in use.` : 'The generated parts of the template in use.')}>
        {slots.length === 0 ? <p className="srow__empty">The template in use has no generated parts.</p> : null}
        {slots.map(([slot, note]) => {
          const id = sectionRuleId(slot);
          const rule = sectionRules.get(id);
          return (
            <div className={`srow srow--rule ${rule && !rule.enabled ? 'is-off' : ''}`} key={slot}>
              <div className="srow__main">
                <div className="srow__text">
                  <p className="srow__title">
                    <IconSpark size={14} className="srow__spark" />
                    <span className="srow__name">{slotTitle(slot)}</span>
                    {rule && !rule.enabled ? <span className="tag tag--gray">Off</span> : null}
                  </p>
                  <p className="srow__desc">{note || 'Two to four sentences.'}</p>
                </div>
                {rule ? (
                  <div className="srow__switch">
                    <Switch
                      checked={rule.enabled}
                      label={`${slotTitle(slot)} rule, on`}
                      disabled={readOnly}
                      onChange={(on) => void run(id, () => actions.save({ id, kind: 'section', title: slot, body: rule.body, enabled: on }))}
                    />
                  </div>
                ) : null}
              </div>
              <RuleText
                value={rule?.body ?? ''}
                label={`Your rule for ${slotTitle(slot)}`}
                placeholder="Your rule for this part"
                readOnly={readOnly}
                busy={busy === id}
                onSave={(body) => void run(id, () => actions.save({ id, kind: 'section', title: slot, body, enabled: rule?.enabled ?? true }), 'Rule saved')}
              />
            </div>
          );
        })}
      </Group>

      <Group icon={<IconChat size={15} />} tone="plum" title={header('Form answers', 'A rule for each kind of open question on a form. Empty means no rule.')}>
        {answerKinds.map((kind) => {
          const rule = answerRules.get(kind.id);
          return (
            <div className={`srow srow--rule ${rule && !rule.enabled ? 'is-off' : ''}`} key={kind.id}>
              <div className="srow__main">
                <div className="srow__text">
                  <p className="srow__title">
                    <span className="srow__name">{kind.title}</span>
                    {rule && !rule.enabled ? <span className="tag tag--gray">Off</span> : null}
                  </p>
                </div>
                {rule && !ANSWER_KINDS.some((k) => answerRuleId(k.title) === kind.id) && !readOnly ? (
                  <div className="srow__tools">
                    <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${kind.title}`} title="Delete" onClick={() => void run(kind.id, () => actions.remove(kind.id), 'Rule deleted')}>
                      <IconTrash size={15} />
                    </button>
                  </div>
                ) : null}
                <div className="srow__switch">
                  {rule ? (
                    <Switch
                      checked={rule.enabled}
                      label={`${kind.title} rule, on`}
                      disabled={readOnly}
                      onChange={(on) => void run(kind.id, () => actions.save({ id: kind.id, kind: 'answer', title: kind.title, body: rule.body, enabled: on, sort: kind.sort }))}
                    />
                  ) : null}
                </div>
              </div>
              <RuleText
                value={rule?.body ?? ''}
                label={`Your rule for ${kind.title}`}
                placeholder={kind.example ? `For example: ${kind.example}` : 'How to answer this kind of question'}
                readOnly={readOnly}
                busy={busy === kind.id}
                rows={2}
                onSave={(body) => void run(kind.id, () => actions.save({ id: kind.id, kind: 'answer', title: kind.title, body, enabled: rule?.enabled ?? true, sort: kind.sort }), 'Rule saved')}
              />
            </div>
          );
        })}
        {!readOnly ? (
          <form
            className="srow srow--addkind"
            onSubmit={(e) => {
              e.preventDefault();
              const title = kindDraft.trim();
              if (!title) return;
              setNewKinds((list) => (list.includes(title) ? list : [...list, title]));
              setKindDraft('');
            }}
          >
            <input className="input" value={kindDraft} onChange={(e) => setKindDraft(e.target.value)} placeholder="Add a kind of question, such as Why our mission" aria-label="Add a kind of question" />
            <button type="submit" className="btn btn--secondary btn--sm" disabled={!kindDraft.trim()}>
              <IconPlus size={14} />
              Add
            </button>
          </form>
        ) : null}
      </Group>

      <Group
        title={header('Always', 'Standing instructions for everything the agent writes.')}
        icon={<IconRules size={15} />}
        tone="ember"
        aside={
          !readOnly ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdding(adding === 'always' ? null : 'always')}>
              <IconPlus size={14} />
              Add a rule
            </button>
          ) : null
        }
      >
        {builtinAlways ? (
          <div className="srow srow--rule">
            <button type="button" className="srow__main srow__toggle" aria-expanded={builtinOpen} onClick={() => setBuiltinOpen((v) => !v)}>
              <span className="srow__text">
                <span className="srow__title">
                  {builtinAlways.title || 'Built-in instructions'}
                  <span className="tag tag--gray">Read only</span>
                </span>
                <span className="srow__desc">{builtinAlways.description || 'What the agent always follows. Add your own below.'}</span>
              </span>
              <span className="srow__control srow__chev" aria-hidden="true">
                <IconChevronDown size={16} className={builtinOpen ? 'is-flipped' : ''} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {builtinOpen ? (
                <motion.pre className="rulepre" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {builtinAlways.body}
                </motion.pre>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
        {adding === 'always' ? (
          <NewRule
            withDescription={false}
            busy={busy === 'new-always'}
            placeholder="Write in the first person and American spelling."
            onCancel={() => setAdding(null)}
            onCreate={(r) =>
              void run('new-always', () => actions.save({ id: alwaysRuleId(r.title), kind: 'always', title: r.title, body: r.body, enabled: true, sort: 50 + ownAlways.length }), 'Rule added').then((ok) => ok && setAdding(null))
            }
          />
        ) : null}
        {ownAlways.map((rule) => (
          <LetterRule key={rule.id} rule={rule} readOnly={readOnly} busy={busy} run={run} actions={actions} />
        ))}
        {ownAlways.length === 0 && adding !== 'always' ? <p className="srow__empty">No standing rules of your own yet.</p> : null}
      </Group>
    </>
  );

  return (
    <div className="page page--rules">
      {readOnly ? (
        <GroupNote tone="warn">
          Read only. Needs the latest <code className="code">supabase/schema.sql</code>
        </GroupNote>
      ) : null}
      {content}
      <p className="rules__foot">
        The agent reads these before it writes anything. Answers it reuses live on{' '}
        <button type="button" className="link-btn" onClick={() => onNavigate('memory')}>
          Memory
        </button>
        . Tone and length are on{' '}
        <button type="button" className="link-btn" onClick={() => onNavigate('preferences')}>
          Preferences
        </button>
        .
      </p>
    </div>
  );
}

const LIVE_ACTIONS: RulesActions = {
  save: saveRule,
  reset: (rule) => resetRule(rule),
  remove: deleteRule,
};

/** The page wired to Supabase. */
export function RulesPage({ userId, toast, onNavigate }: { userId: string; toast: (toast: ToastInput) => void; onNavigate: (page: Page) => void }) {
  const rules = useRules(userId);
  const templates = useCoverTemplates(userId);
  const settings = useCoverSettings(userId);
  const actions = useMemo<RulesActions>(
    () => ({
      save: async (rule) => {
        await LIVE_ACTIONS.save(rule);
        rules.reload();
      },
      reset: async (rule) => {
        await LIVE_ACTIONS.reset(rule);
        rules.reload();
      },
      remove: async (id) => {
        await LIVE_ACTIONS.remove(id);
        rules.reload();
      },
    }),
    [rules],
  );
  return <RulesView data={{ rules, templates, settings: { settings: settings.settings, loading: settings.loading } }} actions={actions} toast={toast} onNavigate={onNavigate} />;
}

export default RulesPage;
