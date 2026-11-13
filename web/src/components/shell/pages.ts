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

export interface PageMeta {
  page: Page;
  title: string;
  /** The tab bar's word. */
  short: string;
  /** One gray line under the title. */
  sub: string;
  Icon: Icon;
}

export const PAGE_META: Record<Page, PageMeta> = {
  overview: { page: 'overview', title: 'Overview', short: 'Overview', sub: 'How the hunt is going, at a glance.', Icon: IconGauge },
  jobs: { page: 'jobs', title: 'Jobs', short: 'Jobs', sub: 'Internships the agent found, scored against your resume.', Icon: IconBriefcase },
  applications: { page: 'applications', title: 'Applications', short: 'Applied', sub: 'Every form the agent filled or sent.', Icon: IconSend },
  inbox: { page: 'inbox', title: 'Inbox', short: 'Inbox', sub: 'Where each application stands, read from your mail.', Icon: IconMail },
  calendar: { page: 'calendar', title: 'Calendar', short: 'Calendar', sub: 'Interviews, calls and deadlines, from your Google Calendar.', Icon: IconCalendar },
  agent: { page: 'agent', title: 'Agent', short: 'Agent', sub: 'The agent on your computer, live.', Icon: IconBot },
  letters: { page: 'letters', title: 'Letters', short: 'Letters', sub: 'Templates, and the letters the agent wrote from them.', Icon: IconLetter },
  companies: { page: 'companies', title: 'Companies', short: 'Companies', sub: 'What intern and new grad postings ask for, company by company.', Icon: IconBuilding },
  profile: { page: 'profile', title: 'Profile', short: 'Profile', sub: 'What the agent puts on application forms.', Icon: IconUser },
  preferences: { page: 'preferences', title: 'Preferences', short: 'Prefs', sub: 'How the agent writes open answers.', Icon: IconSliders },
  rules: { page: 'rules', title: 'Rules', short: 'Rules', sub: 'What the agent follows when it writes letters and answers.', Icon: IconRules },
  memory: { page: 'memory', title: 'Memory', short: 'Memory', sub: 'Answers the agent reuses on forms.', Icon: IconMemory },
  setup: { page: 'setup', title: 'Set up', short: 'Set up', sub: 'Start with your resume.', Icon: IconFlag },
};

/** The sidebar's first group. The Agent page opens from the agent card above it. */
export const MAIN_PAGES: Page[] = ['overview', 'jobs', 'applications', 'inbox', 'calendar', 'letters', 'companies'];
/** The person's own pages: the sidebar's second group. */
export const YOU_PAGES: Page[] = ['setup', 'profile', 'preferences', 'rules', 'memory'];
/** The phone's tab bar; everything else is in the More sheet. */
export const TAB_PAGES: Page[] = ['overview', 'jobs', 'applications', 'inbox'];
export const MORE_PAGES: Page[] = ['agent', 'calendar', 'letters', 'companies', ...YOU_PAGES];
