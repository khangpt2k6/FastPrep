import { Callout } from '../common';
import { IconAlert, IconTerminal } from '../Icons';
import { StartHint } from '../agent/live';

/** Shown while the agent is offline: how to start it. */
export function OfflineCallout() {
  return (
    <Callout tone="gray" icon={<IconTerminal size={16} />}>
      <span className="callout__line">
        Agent offline. Start it: <StartHint />
      </span>
    </Callout>
  );
}

/** Live mode warning, on the pages that apply. */
export function LiveCallout() {
  return (
    <Callout tone="yellow" icon={<IconAlert size={16} />}>
      <strong>Live mode.</strong> Applications are sent to employers.
    </Callout>
  );
}
