import { useState, type CSSProperties } from 'react';
import { initialOf, logoDomain, monogramColors } from '../lib/format';

type Look = 'loading' | 'fill' | 'small' | 'mono';

interface CompanyLogoProps {
  /** The display name: the monogram's letter and colour come from it. */
  name: string;
  /** The company's domain, such as "cisco.com". Without one the tile is a monogram. */
  domain?: string;
  /** Tile size in px: 28 in lists, 32 elsewhere. */
  size?: number;
  className?: string;
}

/**
 * The company's favicon on a white tile with a hairline border. While it loads the tile is plain gray; with no domain,
 * or when the image fails, it is a pastel monogram.
 */
export function CompanyLogo({ name, domain, size = 32, className = '' }: CompanyLogoProps) {
  const host = logoDomain(domain);
  // Keyed by host, so a row that gets a new domain starts over without an effect.
  const [seen, setSeen] = useState<{ host: string; look: Look }>({ host: '', look: 'mono' });
  const look: Look = !host ? 'mono' : seen.host === host ? seen.look : 'loading';

  // Favicons of 32px and up fill the tile; 16px ones (cisco.com, boeing.com) are drawn at their own size.
  const small = Math.round(Math.max(16, Math.min(20, size * 0.55)));
  const mono = monogramColors(name || '?');
  const style = { '--logo': `${size}px`, '--logo-small': `${small}px` } as CSSProperties;

  return (
    <span className={`logo logo--${look} ${className}`} style={style} aria-hidden="true">
      <span className="logo__mono" style={mono}>
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
