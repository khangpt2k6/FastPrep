import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DUR, EASE, SPRING_SOFT } from '../../lib/motion';
import { AnimatedNumber } from '../motion';
import { IconLetter, IconPlay, IconRadar } from '../Icons';

interface ActionBarProps {
  count: number;
  dryRun: boolean;
  online: boolean;
  applying: boolean;
  searching: boolean;
  onApply: () => void;
  onSearch: () => void;
  /** Ask the agent to write cover letters for the selected jobs, to read before applying. */
  onLetters: () => void;
  writing: boolean;
  onClear: () => void;
}

/** Slides up from the bottom once something is selected. */
export function ActionBar(props: ActionBarProps) {
  // Keep the last non-zero count so the bar does not read "0 selected" while it slides away.
  const last = useRef(props.count);
  if (props.count > 0) last.current = props.count;
  return (
    <AnimatePresence>
      {props.count > 0 ? (
        <motion.div
          key="actionbar"
          className="actionbar"
          role="region"
          aria-label="Selected jobs"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT }}
          exit={{ opacity: 0, y: 18, scale: 0.98, transition: { duration: DUR.fast, ease: EASE } }}
        >
          <Bar {...props} count={last.current} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Bar({ count, dryRun, online, applying, searching, onApply, onSearch, onLetters, writing, onClear }: ActionBarProps) {
  return (
    <>
      <div className="actionbar__count">
        <AnimatedNumber className="actionbar__num mono" value={count} from={count} duration={0.35} />
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
        <button type="button" className="btn btn--secondary" onClick={onLetters} disabled={writing} title="Write cover letters for these jobs, to read before applying">
          {writing ? <span className="spinner" aria-hidden="true" /> : <IconLetter size={16} />}
          <span className="hide-phone">Write letters</span>
          <span className="show-phone">Letters</span>
        </button>
        <button type="button" className={`btn ${dryRun ? 'btn--primary' : 'btn--live'}`} onClick={onApply} disabled={!online || applying}>
          {applying ? <span className="spinner" aria-hidden="true" /> : <IconPlay size={14} />}
          Apply to <AnimatedNumber className="mono" value={count} from={count} duration={0.35} /> {count === 1 ? 'job' : 'jobs'}
        </button>
      </div>
    </>
  );
}
