import { Callout } from './common';
import { IconAlert } from './Icons';

/** Shown in place of a page whose table is missing from the Supabase project. */
export function SetupCard({ table }: { table: string }) {
  return (
    <Callout
      tone="yellow"
      icon={<IconAlert size={16} />}
      action={
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => window.location.reload()}>
          Reload
        </button>
      }
    >
      <strong>Database not set up.</strong> Missing <code className="code">{table}</code>. Run <code className="code">supabase/schema.sql</code>.
    </Callout>
  );
}
