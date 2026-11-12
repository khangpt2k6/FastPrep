// Browser notifications and an optional soft chime for finished applications.

const SOUND_KEY = 'agent-automation.sound';
const MUTE_KEY = 'agent-automation.notifications-muted';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private windows can refuse storage; the setting then lasts for this visit only.
  }
}

export const PREF_KEYS = { sound: SOUND_KEY, muted: MUTE_KEY };

export function showBrowserNotification(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const note = new Notification(title, { body, tag, icon: '/favicon.svg' });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker; the toast still shows.
  }
}

let audio: AudioContext | null = null;

/** Two quiet sine notes, about a third of a second long. */
export function playChime(good: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    const ctx = audio;
    if (ctx.state === 'suspended') void ctx.resume();
    const notes = good ? [660, 880] : [520, 390];
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch {
    // Sound is a nicety; never let it break the page.
  }
}
