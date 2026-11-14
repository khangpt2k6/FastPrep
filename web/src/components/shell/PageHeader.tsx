import type { ReactNode } from 'react';
import type { Page } from '../../hooks/useRoute';
import { Friend } from '../mascot/Friend';
import { PAGE_META } from './pages';

interface PageHeaderProps {
  /** The page, for its icon badge and its animal friend. */
  page?: Page;
  title: string;
  /** A count beside the title. */
  count?: ReactNode;
  /** Controls on the right; they wrap under the title on a phone. */
  actions?: ReactNode;
}

/** The top of every page: an icon badge, the title, a count, the page's friend, actions on the right. No subtitle. */
export function PageHeader({ page, title, count, actions }: PageHeaderProps) {
  const meta = page ? PAGE_META[page] : null;
  return (
    <header className="pagehead">
      <div className="pagehead__text">
        {meta ? (
          <span className={`ibadge ibadge--${meta.tone} ibadge--lg`} aria-hidden="true">
            <meta.Icon size={20} />
          </span>
        ) : null}
        <h1 className="pagehead__title">{title}</h1>
        {count !== undefined && count !== null ? <span className="pagehead__count num">{count}</span> : null}
        {meta?.friend ? <Friend name={meta.friend} size={46} className="pagehead__friend" /> : null}
      </div>
      {actions ? <div className="pagehead__actions">{actions}</div> : null}
    </header>
  );
}
