import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Logo } from '../Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface PageHeaderProps {
  icon: Icon;
  title: string;
  /** Small page actions on the right, such as Find jobs or the Dry run switch. */
  actions?: ReactNode;
}

/** A small line icon, the title, and the page's actions on the right. */
export function PageHeader({ icon: Icon, title, actions }: PageHeaderProps) {
  return (
    <header className="pagehead">
      <div className="pagehead__title">
        <Icon size={22} className="pagehead__icon" />
        <h1>{title}</h1>
      </div>
      {actions ? <div className="pagehead__actions">{actions}</div> : null}
    </header>
  );
}

/** The phone's top bar: the mark, the agent's status and alerts. Hidden on wider screens. */
export function MobileBar({ status, alerts }: { status: ReactNode; alerts: ReactNode }) {
  return (
    <div className="mobilebar">
      <span className="mobilebar__mark" aria-hidden="true">
        <Logo size={22} />
      </span>
      <div className="mobilebar__status">{status}</div>
      <div className="mobilebar__alerts">{alerts}</div>
    </div>
  );
}
