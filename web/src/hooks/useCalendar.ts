import { useCallback } from 'react';
import { TABLES, supabase } from '../lib/supabase';
import { CALENDAR_TABLE, type CalendarCommand, type CalendarPayload, type CalendarRow } from '../lib/calendar';
import { useLiveTable, type LiveTable } from './useLiveTable';

const DAY = 86_400_000;

/** The events the agent pushed from Google Calendar: from a week back, kept current as it syncs. */
export function useCalendar(userId: string): LiveTable<CalendarRow> {
  const load = useCallback(
    () =>
      supabase
        .from(CALENDAR_TABLE)
        .select('*')
        .eq('user_id', userId)
        .gte('starts_at', new Date(Date.now() - 8 * DAY).toISOString())
        .order('starts_at', { ascending: true })
        .limit(500),
    [userId],
  );
  // The agent reads the calendar every few minutes; a minute of polling is plenty if the socket drops.
  return useLiveTable<CalendarRow>({ table: CALENDAR_TABLE, userId, load, keyOf: (row) => row.id, pollMs: 60_000 });
}

/**
 * The page's own 'calendar_add' commands, so an event shows while the agent is adding it and says why when it could
 * not. Live updates bring every kind of command: the page keeps only these.
 */
export function useCalendarCommands(userId: string): LiveTable<CalendarCommand> {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.commands)
        .select('id,kind,payload,status,error,created_at')
        .eq('user_id', userId)
        .eq('kind', 'calendar_add')
        .order('created_at', { ascending: false })
        .limit(20),
    [userId],
  );
  return useLiveTable<CalendarCommand>({ table: TABLES.commands, userId, load, keyOf: (row) => (row.id === undefined ? undefined : String(row.id)), pollMs: 30_000 });
}

/** Asks the agent to put an event in Google Calendar. It adds the row here once Google has it. */
export async function addCalendarEvent(payload: CalendarPayload) {
  const { error } = await supabase.from(TABLES.commands).insert({ kind: 'calendar_add', payload, dry_run: true });
  if (error) {
    // 23514: the kind is not in the table's check yet.
    if (error.code === '23514') throw new Error('Adding needs the latest supabase/schema.sql.');
    throw error;
  }
}
