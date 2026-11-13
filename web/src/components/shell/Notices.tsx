import { Callout } from '../common';
import { IconAlert, IconTerminal } from '../Icons';
import { START_SHORTCUT, StartHint } from '../agent/live';

/** Shown while the agent is offline: how to start it. */
export function OfflineCallout() {
  return (
    <Callout tone="gray" icon={<IconTerminal size={16} />}>
      <span className="callout__line">
        <span>
          <strong>Agent offline.</strong> Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop, or run
        </span>
        <StartHint />
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
