import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { dockVariants } from '../../lib/motion';
import { AnimatedNumber, Shimmer } from '../motion';
import { IconLetter, IconPlay, IconX } from '../Icons';

interface ActionBarProps {
  count: number;
  dryRun: boolean;
  /** Why Apply and Write letters are off (agent offline or paused), or '' when they can go. */
  blocked: string;
  applying: boolean;
  onApply: () => void;
  /** Ask the agent to write cover letters for the selected jobs (a cover_letter command), to read before applying. */
  onLetters: () => void;
  writing: boolean;
  onClear: () => void;
}

/** A floating dock that rises once jobs are selected. Live mode gives it a rose edge. */
export function ActionBar(props: ActionBarProps) {
  // Keep the last non-zero count so the bar does not read "0" while it leaves.
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

function Dock({ count, dryRun, blocked, applying, onApply, onLetters, writing, onClear }: ActionBarProps) {
  return (
    <>
      <button type="button" className="icon-btn dock__clear" onClick={onClear} aria-label="Clear selection" title="Clear selection">
        <IconX size={15} />
      </button>
      <span className="dock__count">
        <AnimatedNumber className="num" value={count} from={count} duration={0.3} /> selected
      </span>
      <span className="dock__spacer" />
      {blocked ? <span className="dock__note">{blocked}</span> : null}
      <span className={`tag ${dryRun ? 'tag--yellow' : 'tag--red tag--strong'}`} title={dryRun ? 'Fills forms, never sends' : 'Applications are sent to employers'}>
        {dryRun ? 'Dry run' : 'Live'}
      </span>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onLetters} disabled={writing || Boolean(blocked)} title={blocked || 'Write cover letters for these jobs'}>
        <IconLetter size={14} />
        {writing ? <Shimmer>Writing letters</Shimmer> : 'Write letters'}
      </button>
      <button
        type="button"
        className={`btn btn--sm ${dryRun ? 'btn--primary' : 'btn--danger'}`}
        onClick={onApply}
        disabled={Boolean(blocked) || applying}
        title={blocked || (dryRun ? 'Fill the forms, send nothing' : 'Fill and send the applications')}
      >
        {applying ? <span className="spinner" aria-hidden="true" /> : <IconPlay size={12} />}
        {applying ? (
          <Shimmer tone="inverse">Queuing</Shimmer>
        ) : (
          <>
            Apply <AnimatedNumber className="num" value={count} from={count} duration={0.3} />
          </>
        )}
      </button>
    </>
  );
}
