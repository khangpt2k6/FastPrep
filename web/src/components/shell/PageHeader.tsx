import type { ReactNode } from 'react';
import { Wolf, type WolfMood } from '../mascot/Wolf';

interface PageHeaderProps {
  title: string;
  /** One gray line under the title. */
  subtitle?: string;
  /** The page's wolf, beside the title. */
  wolf?: WolfMood;
  /** A count in a chip beside the title. */
  count?: ReactNode;
  /** Controls on the right; they wrap under the title on a phone. */
  actions?: ReactNode;
}

/** After Arena's page header: the wolf, a big title with a count chip, one gray line, actions on the right. */
export function PageHeader({ title, subtitle, wolf, count, actions }: PageHeaderProps) {
  return (
    <header className="pagehead">
      <div className="pagehead__title">
        {wolf ? <Wolf mood={wolf} size={56} motion="pop" eager className="pagehead__wolf" /> : null}
        <div className="pagehead__text">
          <div className="pagehead__line">
            <h1>{title}</h1>
            {count !== undefined && count !== null ? <span className="chip chip--count num">{count}</span> : null}
          </div>
          {subtitle ? <p className="pagehead__sub">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="pagehead__actions">{actions}</div> : null}
    </header>
  );
}
