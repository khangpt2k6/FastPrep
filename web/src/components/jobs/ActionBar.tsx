import { IconPlay, IconRadar } from '../Icons';

interface ActionBarProps {
  count: number;
  dryRun: boolean;
  online: boolean;
  applying: boolean;
  searching: boolean;
  onApply: () => void;
  onSearch: () => void;
  onClear: () => void;
}

/** Slides up from the bottom once something is selected. */
export function ActionBar({ count, dryRun, online, applying, searching, onApply, onSearch, onClear }: ActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="actionbar" role="region" aria-label="Selected jobs">
      <div className="actionbar__count">
        <span className="actionbar__num mono">{count}</span>
        <span>selected</span>
        <button type="button" className="link-btn link-btn--muted" onClick={onClear}>
          Clear
        </button>
      </div>
      <span className={`modepill ${dryRun ? '' : 'is-live'}`} title={dryRun ? 'Fills the forms but does not submit' : 'Applications are really submitted'}>
        <span className="modepill__dot" aria-hidden="true" />
        <span className="modepill__text">{dryRun ? 'Dry run: nothing is submitted' : 'Live: applications are sent'}</span>
      </span>
      <div className="actionbar__buttons">
        {!online ? <span className="actionbar__why">Agent offline</span> : null}
        <button type="button" className="btn btn--secondary" onClick={onSearch} disabled={searching}>
          {searching ? <span className="spinner" aria-hidden="true" /> : <IconRadar size={16} />}
          <span className="hide-phone">Find more jobs</span>
          <span className="show-phone">More</span>
        </button>
        <button type="button" className={`btn ${dryRun ? 'btn--primary' : 'btn--live'}`} onClick={onApply} disabled={!online || applying}>
          {applying ? <span className="spinner" aria-hidden="true" /> : <IconPlay size={14} />}
          Apply to <span className="mono">{count}</span> {count === 1 ? 'job' : 'jobs'}
        </button>
      </div>
    </div>
  );
}
