import { useCallback, useState } from 'react';
import { PREF_KEYS, notificationsSupported, playChime, readFlag, writeFlag } from '../lib/notify';

export type NotifyPermission = 'unsupported' | NotificationPermission;

export interface NotifyPrefs {
  permission: NotifyPermission;
  /** Permission granted and not muted on this page. */
  enabled: boolean;
  muted: boolean;
  sound: boolean;
  request: () => void;
  setMuted: (value: boolean) => void;
  setSound: (value: boolean) => void;
}

export function useNotifyPrefs(): NotifyPrefs {
  const [permission, setPermission] = useState<NotifyPermission>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );
  const [muted, setMutedState] = useState(() => readFlag(PREF_KEYS.muted, false));
  const [sound, setSoundState] = useState(() => readFlag(PREF_KEYS.sound, false));

  const request = useCallback(() => {
    if (!notificationsSupported()) return;
    const done = (result: NotificationPermission) => {
      setPermission(result);
      if (result === 'granted') {
        setMutedState(false);
        writeFlag(PREF_KEYS.muted, false);
      }
    };
    try {
      const pending = Notification.requestPermission(done);
      if (pending && typeof pending.then === 'function') void pending.then(done);
    } catch {
      setPermission(Notification.permission);
    }
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    writeFlag(PREF_KEYS.muted, value);
  }, []);

  const setSound = useCallback((value: boolean) => {
    setSoundState(value);
    writeFlag(PREF_KEYS.sound, value);
    if (value) playChime(true); // a preview, and it unlocks audio on this click
  }, []);

  return { permission, enabled: permission === 'granted' && !muted, muted, sound, request, setMuted, setSound };
}
