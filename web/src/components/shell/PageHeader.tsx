import type { ReactNode } from 'react';
import { IconLogout, Logo } from '../Icons';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  right: ReactNode;
  /** Shown on phones only, where the sidebar footer is gone. */
  notify: ReactNode;
  onSignOut: () => void;
}

export function PageHeader({ title, subtitle, right, notify, onSignOut }: PageHeaderProps) {
  return (
    <header className="pagehead">
      <span className="pagehead__mark" aria-hidden="true">
        <Logo size={32} />
      </span>
      <h1 className="pagehead__title">{title}</h1>
      <p className="pagehead__sub">{subtitle}</p>
      <div className="pagehead__right">{right}</div>
      <div className="pagehead__phone">
        {notify}
        <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out">
          <IconLogout size={19} />
        </button>
      </div>
    </header>
  );
}
