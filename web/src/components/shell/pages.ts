import type { ComponentType, SVGProps } from 'react';
import type { Page } from '../../hooks/useRoute';
import {
  IconBot,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconFlag,
  IconGauge,
  IconLetter,
  IconMail,
  IconMemory,
  IconRules,
  IconSend,
  IconSliders,
  IconUser,
} from '../Icons';

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** The small palette of icon badges, so pages read at a glance. */
export type Tone = 'ember' | 'sky' | 'pine' | 'plum' | 'rose' | 'sand';

export interface PageMeta {
  page: Page;
  title: string;
  /** The nav's and tab bar's word. */
  short: string;
  Icon: Icon;
  tone: Tone;
  /** The animal friend on the page header (public/mascot/friends), if any. */
  friend?: string;
}

export const PAGE_META: Record<Page, PageMeta> = {
  overview: { page: 'overview', title: 'Overview', short: 'Overview', Icon: IconGauge, tone: 'ember' },
  jobs: { page: 'jobs', title: 'Jobs', short: 'Jobs', Icon: IconBriefcase, tone: 'sky', friend: 'raccoon-search' },
  applications: { page: 'applications', title: 'Applications', short: 'Applied', Icon: IconSend, tone: 'pine', friend: 'fox-checklist' },
  inbox: { page: 'inbox', title: 'Inbox', short: 'Inbox', Icon: IconMail, tone: 'plum', friend: 'bunny-reading' },
  calendar: { page: 'calendar', title: 'Calendar', short: 'Calendar', Icon: IconCalendar, tone: 'rose', friend: 'panda-idea' },
  agent: { page: 'agent', title: 'Agent', short: 'Agent', Icon: IconBot, tone: 'ember' },
  letters: { page: 'letters', title: 'Letters', short: 'Letters', Icon: IconLetter, tone: 'sand', friend: 'fox-laptop' },
  companies: { page: 'companies', title: 'Companies', short: 'Companies', Icon: IconBuilding, tone: 'sky', friend: 'raccoon-cool' },
  profile: { page: 'profile', title: 'Profile', short: 'Profile', Icon: IconUser, tone: 'plum', friend: 'bear-graduate' },
  preferences: { page: 'preferences', title: 'Preferences', short: 'Prefs', Icon: IconSliders, tone: 'pine', friend: 'penguin-music' },
  rules: { page: 'rules', title: 'Rules', short: 'Rules', Icon: IconRules, tone: 'sand', friend: 'robot-laptop' },
  memory: { page: 'memory', title: 'Memory', short: 'Memory', Icon: IconMemory, tone: 'rose', friend: 'panda-reading' },
  setup: { page: 'setup', title: 'Set up', short: 'Set up', Icon: IconFlag, tone: 'ember', friend: 'bunny-laptop' },
};

/** The sidebar's first group. The agent itself lives in the top bar; its page is here too. */
export const MAIN_PAGES: Page[] = ['overview', 'jobs', 'applications', 'inbox', 'calendar', 'letters', 'companies', 'agent'];
/** The person's own pages: the sidebar's second group. */
export const YOU_PAGES: Page[] = ['setup', 'profile', 'preferences', 'rules', 'memory'];
/** The phone's tab bar; everything else is in the More sheet. */
export const TAB_PAGES: Page[] = ['overview', 'jobs', 'applications', 'inbox'];
export const MORE_PAGES: Page[] = ['agent', 'calendar', 'letters', 'companies', ...YOU_PAGES];
