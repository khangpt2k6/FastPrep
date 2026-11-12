import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { INBOX_TABLE, type InboxRow } from '../lib/inbox';
import { useLiveTable, type LiveTable } from './useLiveTable';

/** The applications the inbox sync found, kept current as the agent pushes a new sync. */
export function useInbox(userId: string): LiveTable<InboxRow> {
  const load = useCallback(
    () => supabase.from(INBOX_TABLE).select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1000),
    [userId],
  );
  // A minute is enough: the agent reads the mailbox every quarter of an hour.
  return useLiveTable<InboxRow>({ table: INBOX_TABLE, userId, load, keyOf: (row) => row.id, pollMs: 60_000 });
}
