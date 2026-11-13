import type { ComponentType, SVGProps } from 'react';
import type { Page } from '../../hooks/useRoute';
import type { WolfMood } from '../mascot/Wolf';
import {
  IconBot,
  IconBriefcase,
  IconBuilding,
  IconFlag,
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
  /** The tab bar's word, where six must fit. */
  short: string;
  /** One gray line under the title. */
  sub: string;
  Icon: Icon;
  /** The wolf beside the title. */
  wolf: WolfMood;
}

export const PAGE_META: Record<Page, PageMeta> = {
  jobs: { page: 'jobs', title: 'Jobs', short: 'Jobs', sub: 'Internships the agent found, scored against your resume.', Icon: IconBriefcase, wolf: 'thinking' },
  applications: { page: 'applications', title: 'Applications', short: 'Applied', sub: 'Every form the agent filled or sent.', Icon: IconSend, wolf: 'checklist' },
  inbox: { page: 'inbox', title: 'Inbox', short: 'Inbox', sub: 'Where each application stands, read from your mail.', Icon: IconMail, wolf: 'reading' },
  agent: { page: 'agent', title: 'Agent', short: 'Agent', sub: 'The agent on your computer, live.', Icon: IconBot, wolf: 'laptop' },
  letters: { page: 'letters', title: 'Cover letters', short: 'Letters', sub: 'Templates, and the letters the agent wrote from them.', Icon: IconLetter, wolf: 'reading' },
  companies: { page: 'companies', title: 'Companies', short: 'Companies', sub: 'What intern and new grad postings ask for, company by company.', Icon: IconBuilding, wolf: 'laptop' },
  profile: { page: 'profile', title: 'Profile', short: 'Profile', sub: 'What the agent puts on application forms.', Icon: IconUser, wolf: 'checklist' },
  preferences: { page: 'preferences', title: 'Preferences', short: 'Prefs', sub: 'How the agent writes open answers.', Icon: IconSliders, wolf: 'reading' },
  rules: { page: 'rules', title: 'Rules', short: 'Rules', sub: 'What the agent follows when it writes letters and answers.', Icon: IconRules, wolf: 'checklist' },
  memory: { page: 'memory', title: 'Memory', short: 'Memory', sub: 'Answers the agent reuses on forms.', Icon: IconMemory, wolf: 'thinking' },
  setup: { page: 'setup', title: 'Set up', short: 'Set up', sub: 'Start with your resume.', Icon: IconFlag, wolf: 'checklist' },
};

/** The navbar's links and the first block of the sidebar. */
export const MAIN_PAGES: Page[] = ['jobs', 'applications', 'inbox', 'agent', 'letters', 'companies'];
/** The person's own pages: the sidebar's second block, and "More" where there is no sidebar. */
export const YOU_PAGES: Page[] = ['setup', 'profile', 'preferences', 'rules', 'memory'];
