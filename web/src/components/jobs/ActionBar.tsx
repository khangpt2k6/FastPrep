import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dockVariants } from '../../lib/motion';
import { AnimatedNumber } from '../motion';
import { IconLetter, IconPlay, IconX } from '../Icons';

interface ActionBarProps {
  count: number;
  dryRun: boolean;
  online: boolean;
  applying: boolean;
  onApply: () => void;
  /** Ask the agent to write cover letters for the selected jobs (a cover_letter command), to read before applying. */
  onLetters: () => void;
  writing: boolean;
  onClear: () => void;
}

/** A floating glass dock that rises from the bottom once something is selected. */
export function ActionBar(props: ActionBarProps) {
  // Keep the last non-zero count so the dock does not read "0" while it sinks away.
  const last = useRef(props.count);
  if (props.count > 0) last.current = props.count;
  return (
    <AnimatePresence>
      {props.count > 0 ? (
        <motion.div
          key="dock"
          className={`dock ${props.dryRun ? '' : 'is-live'}`}
          role="region"
          aria-label="Selected jobs"
          variants={dockVariants}
          initial="hidden"
          animate="shown"
          exit="gone"
        >
          <Dock {...props} count={last.current} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Dock({ count, dryRun, online, applying, onApply, onLetters, writing, onClear }: ActionBarProps) {
  return (
    <>
      <div className="dock__count">
        <AnimatedNumber className="dock__num mono" value={count} from={count} duration={0.35} />
        <span className="dock__label">selected</span>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClear} aria-label="Clear the selection" title="Clear">
          <IconX size={14} />
        </button>
      </div>
      <span className={`modepill ${dryRun ? '' : 'is-live'}`} title={dryRun ? 'Fills forms, never sends' : 'Live: applications are really sent'}>
        <span className="modepill__dot" aria-hidden="true" />
        {dryRun ? 'Dry run' : 'Live'}
      </span>
      <div className="dock__buttons">
        {!online ? (
          <span className="dock__why" title="Start the agent on your computer first">
            Agent offline
          </span>
        ) : null}
        <button type="button" className="btn btn--secondary" onClick={onLetters} disabled={writing} title="Write cover letters for these jobs, to read before applying">
          {writing ? <span className="spinner" aria-hidden="true" /> : <IconLetter size={16} />}
          <span className="hide-phone">Write letters</span>
          <span className="show-phone">Letters</span>
        </button>
        <button
          type="button"
          className={`btn ${dryRun ? 'btn--primary btn--shimmer' : 'btn--live'}`}
          onClick={onApply}
          disabled={!online || applying}
          title={dryRun ? 'Dry run: fill the forms, send nothing' : 'Live: fill and send the applications'}
        >
          {applying ? <span className="spinner" aria-hidden="true" /> : <IconPlay size={14} />}
          Apply <AnimatedNumber className="mono" value={count} from={count} duration={0.35} />
        </button>
      </div>
    </>
  );
}
