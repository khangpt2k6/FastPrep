// One rule at a time: a dropdown picks the part (a letter section or a kind of question), one text box edits it.
// Unsaved text is kept per part while switching, and the part shows an ember dot in the menu until it is saved.
import { useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { RuleRow, RuleWrite } from '../../lib/rules';
import { Dropdown, type DropdownOption } from '../Dropdown';
import { IconCheck, IconPlus, IconTrash } from '../Icons';
import { Switch } from '../settings';
import type { Tone } from '../shell/pages';
import './rulePicker.css';

export interface PickItem {
  id: string;
  title: string;
  /** A gray line in the menu while the part has no rule. */
  hint?: string;
  placeholder: string;
  rule?: RuleRow;
  /** The person's own kind of question: it can be deleted. */
  removable?: boolean;
  /** The row to write for this part with a new text or switch. */
  write: (patch: { body?: string; enabled?: boolean }) => RuleWrite;
}

interface RulePickerProps {
  items: PickItem[];
  /** The dropdown's name, for screen readers ("Letter section"). */
  label: string;
  tone: Tone;
  readOnly: boolean;
  busy: string | null;
  save: (rule: RuleWrite, done?: string) => Promise<boolean>;
  remove?: (id: string) => Promise<boolean>;
  /** Adds a part from its title and returns its id. Shows a "New" action under the menu. */
  onAdd?: (title: string) => string;
  addLabel?: string;
  addPlaceholder?: string;
  rows?: number;
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? '';

export function RulePicker({ items, label, tone, readOnly, busy, save, remove, onAdd, addLabel = 'New', addPlaceholder = '', rows = 4 }: RulePickerProps) {
  const id = useId();
  const [pick, setPick] = useState(items[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const current = items.find((i) => i.id === pick) ?? items[0];
  const stored = (item: PickItem) => item.rule?.body ?? '';
  const isDirty = (item: PickItem) => drafts[item.id] !== undefined && drafts[item.id].trim() !== stored(item).trim();

  // A draft that matches what is stored (saved, or put back) is no longer a draft.
  const storedKey = items.map((i) => `${i.id}\u0000${stored(i)}`).join('\u0001');
  useEffect(() => {
    setDrafts((d) => {
      let changed = false;
      const next = { ...d };
      for (const item of items) {
        if (next[item.id] !== undefined && next[item.id].trim() === stored(item).trim()) {
          delete next[item.id];
          changed = true;
        }
      }
      return changed ? next : d;
    });
    // storedKey stands in for items: same ids and texts mean nothing to clear.
  }, [storedKey]);

  const options = useMemo<DropdownOption<string>[]>(
    () =>
      items.map((item) => {
        const rule = item.rule;
        const has = Boolean(rule && rule.body.trim());
        const dirty = isDirty(item);
        return {
          value: item.id,
          label: item.title,
          hint: dirty ? 'Not saved' : has ? firstLine(rule!.body) : item.hint,
          dot: dirty ? 'ember' : !has ? 'hollow' : rule!.enabled ? 'pine' : 'sand',
          badge: rule && !rule.enabled ? <span className="tag tag--gray">Off</span> : undefined,
        };
      }),
    [items, drafts],
  );

  const withRule = items.filter((i) => i.rule && i.rule.body.trim()).length;

  if (!current) return null;

  const rule = current.rule;
  const text = drafts[current.id] ?? stored(current);
  const dirty = isDirty(current);
  const saving = busy === current.id;

  function setText(value: string) {
    setDrafts((d) => ({ ...d, [current.id]: value }));
  }

  function cancel() {
    setDrafts((d) => {
      const next = { ...d };
      delete next[current.id];
      return next;
    });
  }

  function add() {
    const title = newTitle.trim();
    if (!title || !onAdd) return;
    setPick(onAdd(title));
    setNewTitle('');
    setAdding(false);
  }

  return (
    <div className="rulepick">
      <div className="rulepick__bar">
        <Dropdown<string>
          value={current.id}
          options={options}
          onChange={setPick}
          label={label}
          tone={tone}
          actions={onAdd && !readOnly ? [{ label: addLabel, icon: <IconPlus size={13} />, onSelect: () => setAdding(true) }] : []}
        />
        <span className="rulepick__count num" title="Parts with a rule">
          {withRule}/{items.length}
        </span>
        <div className="rulepick__tools">
          {current.removable && remove && !readOnly ? (
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              aria-label={`Delete ${current.title}`}
              title="Delete"
              onClick={() =>
                void remove(current.id).then((ok) => {
                  if (ok) setPick(items[0]?.id ?? '');
                })
              }
            >
              <IconTrash size={15} />
            </button>
          ) : null}
          {rule ? (
            <Switch checked={rule.enabled} label={`${current.title} rule, on`} disabled={readOnly} onChange={(on) => void save(current.write({ enabled: on }))} />
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {adding ? (
          <motion.form
            className="rulepick__add"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={addPlaceholder} aria-label={addLabel} autoFocus />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--secondary btn--sm" disabled={!newTitle.trim()}>
              <IconPlus size={14} />
              Add
            </button>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={current.id} className={`rulebox ${rule && !rule.enabled ? 'is-off' : ''}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
          <label className="sr-only" htmlFor={`${id}-text`}>
            {`Your rule for ${current.title}`}
          </label>
          <textarea id={`${id}-text`} className="input textarea" rows={rows} value={text} placeholder={current.placeholder} readOnly={readOnly} onChange={(e) => setText(e.target.value)} />
          <AnimatePresence initial={false}>
            {dirty ? (
              <motion.div className="rulebox__bar" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={cancel} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => void save(current.write({ body: text.trim() }), 'Rule saved')} disabled={saving || readOnly}>
                  {saving ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
                  Save
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
