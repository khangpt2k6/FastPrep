import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentRow, AgentSettings } from '../../lib/types';
import { panelVariants } from '../../lib/motion';
import { AgentWolf, WolfTile, wolfForState } from '../mascot/Wolf';
import { Shimmer } from '../motion';
import { Switch } from '../settings';
import { agentTone, START_SHORTCUT } from '../agent/live';
import { statusWords } from './StatusControls';
import { useDismiss } from './Navbar';
import { IconChevronRight, IconRadar } from '../Icons';

interface AgentQuickProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  settings: AgentSettings;
  /** The settings table is missing: the switch is shown off. */
  settingsOff: boolean;
  onSettings: (patch: Partial<AgentSettings>) => void;
  searching: boolean;
  onSearch: () => void;
  onOpen: () => void;
}

/** The agent at a glance: the wolf, its state, what it is doing, a pause switch and Find more. */
function AgentSummary({ agent, online, loading, now, settings, settingsOff, onSettings, searching, onSearch, onOpen }: AgentQuickProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = loading ? 'off' : agentTone(online, state);
  const { word, line } = statusWords(agent, online, loading, now, tone);
  const quiet = tone === 'off' || tone === 'paused';
  return (
    <>
      <div className="quick__head">
        <WolfTile mood={quiet ? 'music' : wolfForState(state)} size={44} on={tone === 'busy'} dim={quiet} />
        <div className="quick__who">
          <p className="quick__word">
            <span className={`sdot sdot--${tone}`} aria-hidden="true" />
            {word}
          </p>
          <p className="quick__line">
            {tone === 'off' && !loading ? (
              <>
                Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop.
              </>
            ) : (
              <Shimmer active={tone === 'busy'}>{line}</Shimmer>
            )}
          </p>
        </div>
      </div>
      <label className="quick__row">
        <span>Agent on</span>
        <Switch checked={!settings.paused} onChange={(on) => onSettings({ paused: !on })} disabled={settingsOff} label="Agent on" />
      </label>
      <div className="quick__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={onSearch} disabled={searching}>
          <IconRadar size={14} />
          {searching ? <Shimmer tone="inverse">Finding jobs</Shimmer> : 'Find more'}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpen}>
          Agent page
          <IconChevronRight size={14} />
        </button>
      </div>
    </>
  );
}

/** The agent's card in the Jobs page rail. */
export function AgentCard(props: AgentQuickProps) {
  return (
    <section className="card quick quick--card" aria-label="Agent">
      <AgentSummary {...props} />
    </section>
  );
}

/** A round wolf button in the bottom right corner that opens the agent's quick panel. */
export function QuickAgent(props: AgentQuickProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));
  const state = props.online ? props.agent?.state ?? 'idle' : 'offline';
  const tone = props.loading ? 'off' : agentTone(props.online, state);
  return (
    <div className="fab" ref={box}>
      <AnimatePresence>
        {open ? (
          <motion.div className="card quick quick--panel" role="dialog" aria-label="Agent" variants={panelVariants} initial="hidden" animate="shown" exit="gone">
            <AgentSummary
              {...props}
              onOpen={() => {
                setOpen(false);
                props.onOpen();
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        className={`fab__btn press fab__btn--${tone}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Agent quick panel"
        title="Agent"
        onClick={() => setOpen((v) => !v)}
      >
        <AgentWolf tone={tone} state={state} size={50} motion={tone === 'busy' ? 'bob' : 'none'} />
        {tone === 'busy' ? <span className="fab__ring" aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
