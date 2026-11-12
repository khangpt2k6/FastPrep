import { useState, type CSSProperties } from 'react';
import { initialOf, logoDomain, monogramGradient } from '../lib/format';

type Look = 'loading' | 'fill' | 'small' | 'mono';

interface CompanyLogoProps {
  /** The display name: the monogram's letter and colour come from it. */
  name: string;
  /** The company's domain, such as "cisco.com". Without one the tile is a monogram. */
  domain?: string;
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/**
 * The company's favicon on a white app-icon tile, so dark and transparent logos read on the dark page.
 * The monogram shows while the image loads and stays when there is no domain or the image fails.
 */
export function CompanyLogo({ name, domain, size = 40, className = '' }: CompanyLogoProps) {
  const host = logoDomain(domain);
  // Keyed by host, so a row that gets a new domain starts over without an effect.
  const [seen, setSeen] = useState<{ host: string; look: Look }>({ host: '', look: 'mono' });
  const look: Look = !host ? 'mono' : seen.host === host ? seen.look : 'loading';

  // Favicons of 32px and up fill the tile; 16px ones (cisco.com, boeing.com) are drawn small so they stay crisp.
  const small = Math.round(Math.max(16, Math.min(20, size * 0.5)));
  const style = { '--logo': `${size}px`, '--logo-small': `${small}px` } as CSSProperties;

  return (
    <span className={`logo logo--${look} ${className}`} style={style} aria-hidden="true">
      <span className="logo__mono" style={{ backgroundImage: monogramGradient(name || '?') }}>
        {initialOf(name || '?')}
      </span>
      {host && look !== 'mono' ? (
        <img
          key={host}
          className="logo__img"
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={(event) => {
            const width = event.currentTarget.naturalWidth;
            setSeen({ host, look: width >= 32 ? 'fill' : width >= 16 ? 'small' : 'mono' });
          }}
          onError={() => setSeen({ host, look: 'mono' })}
        />
      ) : null}
    </span>
  );
}
