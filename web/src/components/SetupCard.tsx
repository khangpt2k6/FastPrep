import { IconAlert } from './Icons';

/** Shown in place of a page whose table is missing from the Supabase project. */
export function SetupCard({ table }: { table: string }) {
  return (
    <section className="card setupcard" aria-labelledby="setup-title">
      <span className="setupcard__icon" aria-hidden="true">
        <IconAlert size={20} />
      </span>
      <h2 id="setup-title">Database not set up: run supabase/schema.sql</h2>
      <p>
        The <code>{table}</code> table is not in your Supabase project yet. Open the SQL editor in the Supabase dashboard,
        paste the contents of <code>supabase/schema.sql</code>, run it, then reload this page. It is safe to run more than
        once.
      </p>
      <button type="button" className="btn btn--dark btn--sm" onClick={() => window.location.reload()}>
        Reload
      </button>
    </section>
  );
}
