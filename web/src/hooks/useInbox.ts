import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { INBOX_TABLE, type InboxMessage, type InboxRow } from '../lib/inbox';
import { useLiveTable, type LiveTable } from './useLiveTable';

/**
 * The list: every column but the mails themselves (about 670 KB together), with only the newest mail for the preview
 * line. A database without the newer columns gets everything it has.
 */
const LIST_COLUMNS = 'user_id,id,company,role,status,applied_at,updated_at,subject,mails,by_agent,synced_at,domain,applied_known,latest:messages->0';

/** The applications the inbox sync found, kept current as the agent pushes a new sync. */
export function useInbox(userId: string): LiveTable<InboxRow> {
  const load = useCallback(async () => {
    const query = (columns: string) => supabase.from(INBOX_TABLE).select(columns).eq('user_id', userId).order('updated_at', { ascending: false }).limit(1000).returns<InboxRow[]>();
    const first = await query(LIST_COLUMNS);
    // 42703 or PGRST: a column the page asks for is not in this database yet.
    return first.error && first.error.code !== '42P01' && first.error.code !== 'PGRST205' ? query('*') : first;
  }, [userId]);
  // A minute is enough: the agent reads the mailbox every quarter of an hour.
  return useLiveTable<InboxRow>({ table: INBOX_TABLE, userId, load, keyOf: (row) => row.id, pollMs: 60_000 });
}

/** The mails of one application, newest first; [] when there are none or the column is not there yet. */
export async function fetchInboxMessages(row: Pick<InboxRow, 'id' | 'messages'>): Promise<InboxMessage[]> {
  if (Array.isArray(row.messages)) return row.messages;
  const { data, error } = await supabase.from(INBOX_TABLE).select('messages').eq('id', row.id).maybeSingle<{ messages: InboxMessage[] | null }>();
  if (error) return [];
  return Array.isArray(data?.messages) ? data.messages : [];
}

/**
 * The opened application's thread, fetched when it opens and again when the application gets a newer mail.
 * `load` is how to get it (the preview passes its own).
 */
export function useInboxThread(row: InboxRow | null, load: (row: InboxRow) => Promise<InboxMessage[]>) {
  const [state, setState] = useState<{ key: string; messages: InboxMessage[]; loading: boolean }>({ key: '', messages: [], loading: false });
  const key = row ? `${row.id}@${row.updated_at}` : '';
  const run = useCallback(load, [load]);
  useEffect(() => {
    if (!row) return;
    let alive = true;
    setState((s) => (s.key === key ? s : { key, messages: [], loading: true }));
    run(row)
      .then((messages) => alive && setState({ key, messages, loading: false }))
      .catch(() => alive && setState({ key, messages: [], loading: false }));
    return () => {
      alive = false;
    };
    // The row object changes on every poll; the key says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run]);
  return state.key === key ? state : { key, messages: [], loading: Boolean(row) };
}
