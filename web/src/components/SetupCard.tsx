import { IconAlert } from './Icons';

/** Shown in place of a page whose table is missing from the Supabase project. */
export function SetupCard({ table }: { table: string }) {
  return (
    <section className="card setupcard" aria-labelledby="setup-title">
      <span className="setupcard__icon" aria-hidden="true">
        <IconAlert size={20} />
      </span>
      <h2 id="setup-title">Database not set up</h2>
      <p>
        <code>{table}</code> is missing. Run <code>supabase/schema.sql</code> in the Supabase SQL editor, then reload.
      </p>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => window.location.reload()}>
        Reload
      </button>
    </section>
  );
}
