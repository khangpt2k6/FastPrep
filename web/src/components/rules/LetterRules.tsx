import { useEffect, useId, useState, type ReactNode, type SVGProps } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { RuleRow, RuleWrite } from '../../lib/rules';
import { Switch } from '../settings';
import { IconCheck, IconPencil, IconRepeat, IconTrash } from '../Icons';
import type { RulesActions } from './RulesPage';
import './letterRules.css';

type Run = (key: string, action: () => Promise<void>, done?: string) => Promise<boolean>;

function Glyph({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

/** One quiet outline glyph per shipped rule, by its folder name; the person's own rules get the pencil line. */
const GLYPHS: Record<string, ReactNode> = {
  truth: (
    <Glyph>
      <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z" />
      <path d="M9 12.2l2.2 2.2L15.2 10" />
    </Glyph>
  ),
  evidence: (
    <Glyph>
      <path d="M7 19v-4M12 19V9.5M17 19V5" />
    </Glyph>
  ),
  company: (
    <Glyph>
      <path d="M3.5 9.5L12 4.5l8.5 5M5 9.5h14M6.5 9.5v8M10 9.5v8M14 9.5v8M17.5 9.5v8M4 19.5h16" />
    </Glyph>
  ),
  voice: (
    <Glyph>
      <path d="M20 11.5a8 7.5 0 0 1-11.6 6.7L4 19.5l1.4-3.6A7.2 7.2 0 0 1 4 11.5a8 7.5 0 0 1 16 0z" />
    </Glyph>
  ),
  structure: (
    <Glyph>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h9" />
    </Glyph>
  ),
  heart: (
    <Glyph>
      <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
      <path d="M8.5 12.2h2l1-1.8 1.6 3.3 1-1.5h1.4" />
    </Glyph>
  ),
  plain: (
    <Glyph>
      <path d="M12 7c-1.8-1.5-4.6-2-8-1.8v12.6c3.4-.2 6.2.3 8 1.8 1.8-1.5 4.6-2 8-1.8V5.2c-3.4-.2-6.2.3-8 1.8zM12 7v12.6" />
    </Glyph>
  ),
  keywords: (
    <Glyph>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  gaps: (
    <Glyph>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.2L7.8 20.5l4.2-2.3 4.2 2.3-1.2-7.3" />
    </Glyph>
  ),
  format: (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.6 2.6 4.9-5.2" />
    </Glyph>
  ),
};

const OWN_GLYPH = (
  <Glyph>
    <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
    <path d="M13.5 8.5l3 3" />
  </Glyph>
);

function glyphOf(rule: RuleRow): ReactNode {
  return GLYPHS[rule.id.split('/').pop() ?? ''] ?? OWN_GLYPH;
}

/** The rule's text, with Save and Cancel. */
function Editor({ value, label, readOnly, busy, onSave, onClose }: { value: string; label: string; readOnly: boolean; busy: boolean; onSave: (text: string) => void; onClose: () => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const dirty = text.trim() !== value.trim();
  return (
    <motion.div className="lrule__edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="input textarea" rows={5} value={text} readOnly={readOnly} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="lrule__bar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave(text.trim())} disabled={busy || readOnly || !dirty}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
          Save
        </button>
      </div>
    </motion.div>
  );
}

function LetterRule({ rule, index, readOnly, busy, run, actions }: { rule: RuleRow; index: number; readOnly: boolean; busy: string | null; run: Run; actions: RulesActions }) {
  const [editing, setEditing] = useState(false);
  const edited = rule.updated_by === 'web';
  const changed = rule.builtin && rule.default_body !== '' && rule.body !== rule.default_body;
  const write = (patch: Partial<RuleWrite>): RuleWrite => ({ id: rule.id, kind: rule.kind, title: rule.title, description: rule.description, body: rule.body, enabled: rule.enabled, ...patch });
  return (
    <motion.li
      className={`lrule ${rule.enabled ? '' : 'is-off'} ${editing ? 'is-editing' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index, 12) * 0.035, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="lrule__icon">{glyphOf(rule)}</span>
      <div className="lrule__body">
        <p className="lrule__title">
          <span>{rule.title}</span>
          {!rule.enabled ? <span className="tag tag--gray">Off</span> : null}
          {edited ? <span className="tag tag--ember">Edited</span> : null}
          {!rule.builtin ? <span className="tag tag--gray">Yours</span> : null}
        </p>
        {rule.description ? <p className="lrule__desc">{rule.description}</p> : null}
        <AnimatePresence initial={false}>
          {editing ? (
            <Editor
              value={rule.body}
              label={`${rule.title}, the rule`}
              readOnly={readOnly}
              busy={busy === rule.id}
              onClose={() => setEditing(false)}
              onSave={(body) => void run(rule.id, () => actions.save(write({ body })), 'Rule saved').then((ok) => ok && setEditing(false))}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <div className="lrule__tools">
        {!readOnly ? (
          <button type="button" className={`icon-btn ${editing ? 'is-on' : ''}`} aria-label={`Edit ${rule.title}`} title="Edit" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            <IconPencil size={14} />
          </button>
        ) : null}
        {rule.builtin && (edited || changed) && !readOnly ? (
          <button type="button" className="icon-btn" aria-label={`Reset ${rule.title}`} title="Reset to the shipped text" disabled={busy === rule.id} onClick={() => void run(rule.id, () => actions.reset(rule), 'Rule reset')}>
            <IconRepeat size={14} />
          </button>
        ) : null}
        {!rule.builtin && !readOnly ? (
          <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${rule.title}`} title="Delete" onClick={() => void run(rule.id, () => actions.remove(rule.id), 'Rule deleted')}>
            <IconTrash size={14} />
          </button>
        ) : null}
        <Switch checked={rule.enabled} label={`${rule.title}, on`} disabled={readOnly} onChange={(on) => void run(rule.id, () => actions.save(write({ enabled: on })))} />
      </div>
    </motion.li>
  );
}

/** The cover letter rules as a plain list: a glyph, the rule's name in bold and its line below. Edit, reset and the switch
 * sit at the right and show on hover. */
export function LetterRules({ rules, readOnly, busy, run, actions }: { rules: RuleRow[]; readOnly: boolean; busy: string | null; run: Run; actions: RulesActions }) {
  return (
    <ul className="lrules">
      {rules.map((rule, i) => (
        <LetterRule key={rule.id} rule={rule} index={i} readOnly={readOnly} busy={busy} run={run} actions={actions} />
      ))}
    </ul>
  );
}
