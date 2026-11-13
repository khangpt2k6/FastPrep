import { useCallback } from 'react';
import { TABLES, supabase } from '../lib/supabase';
import type { RuleRow, RuleWrite } from '../lib/rules';
import { useLiveTable } from './useLiveTable';

const RULES_TABLE = TABLES.rules;

/** The person's rules, live. A missing table reports error.kind 'missing-table'. */
export function useRules(userId: string) {
  const load = useCallback(
    () => supabase.from(RULES_TABLE).select('*').eq('user_id', userId).order('sort').limit(500).returns<RuleRow[]>(),
    [userId],
  );
  return useLiveTable<RuleRow>({ table: RULES_TABLE, userId, load, keyOf: (row) => row.id, pollMs: 60_000 });
}

/** Writes a rule as the person's: the agent never puts its shipped text back over it. */
export async function saveRule(rule: RuleWrite) {
  const { error } = await supabase
    .from(RULES_TABLE)
    .upsert({ ...rule, updated_by: 'web', updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' });
  if (error) throw error;
}

/** Puts a built-in rule back to what the agent shipped, and hands it back to the agent. */
export async function resetRule(rule: Pick<RuleRow, 'id' | 'kind' | 'title' | 'default_body'>) {
  const { error } = await supabase
    .from(RULES_TABLE)
    .upsert(
      { id: rule.id, kind: rule.kind, title: rule.title, body: rule.default_body, enabled: true, updated_by: 'agent', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,id' },
    );
  if (error) throw error;
}

export async function deleteRule(id: string) {
  const { error } = await supabase.from(RULES_TABLE).delete().eq('id', id);
  if (error) throw error;
}
