import type { MouseEvent } from 'react';
import type { Page } from '../../hooks/useRoute';

/** A click that changes page in place, except with a modifier key (new tab) or another button. */
export function linkClick(onNavigate: (page: Page) => void, target: Page) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };
}
