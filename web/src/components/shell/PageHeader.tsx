import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** One gray line under the title. */
  subtitle?: ReactNode;
  /** A count beside the title, in mono. */
  count?: ReactNode;
  /** Controls on the right; they wrap under the title on a phone. */
  actions?: ReactNode;
}

/** The top of every page: a display title with an optional count, one gray line, actions on the right. */
export function PageHeader({ title, subtitle, count, actions }: PageHeaderProps) {
  return (
    <header className="pagehead">
      <div className="pagehead__text">
        <div className="pagehead__line">
          <h1 className="pagehead__title">{title}</h1>
          {count !== undefined && count !== null ? <span className="pagehead__count num">{count}</span> : null}
        </div>
        {subtitle ? <p className="pagehead__sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="pagehead__actions">{actions}</div> : null}
    </header>
  );
}
