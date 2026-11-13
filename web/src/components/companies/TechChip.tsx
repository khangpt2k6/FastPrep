import { TECH_ICONS } from '../../data/companies/techIcons';

export type ChipTone = 'need' | 'stack' | 'niche';

/** A technology's mark: a simple-icons path in its brand colour, or a file logo. */
export function TechIcon({ name, size = 13 }: { name: string; size?: number }) {
  const icon = TECH_ICONS[name.toLowerCase()];
  if (!icon) return null;
  if ('src' in icon) {
    return <img src={icon.src} alt="" width={size + 2} height={size + 2} className="tech__img" />;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="tech__svg" aria-hidden="true" focusable="false">
      <path d={icon.path} fill={icon.dark ? 'currentColor' : icon.hex} />
    </svg>
  );
}

/** One technology. Clicking it filters the page to companies that use it; niche items are plain labels. */
export function TechChip({ name, tone, active = false, onPick }: { name: string; tone: ChipTone; active?: boolean; onPick?: (name: string) => void }) {
  if (tone === 'niche' || !onPick) {
    return (
      <span className={`tech tech--${tone}`}>
        {tone !== 'niche' ? <TechIcon name={name} /> : null}
        {name}
      </span>
    );
  }
  return (
    <button type="button" className={`tech tech--${tone} press ${active ? 'is-on' : ''}`} aria-pressed={active} onClick={() => onPick(name)}>
      <TechIcon name={name} />
      {name}
    </button>
  );
}
