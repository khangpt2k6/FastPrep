// Dev-only preview at #/__preview: the real pages with mock data, plus buttons that fake live events.
// App.tsx only loads this behind import.meta.env.DEV, so it never ships in a production build.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentRow, AgentSettings, CommandRow, JobRow, MemoryRow, PreferencesRow, ProfileRow, ResumeRow } from '../../lib/types';
import type { CoverLetterRow, CoverSettings, CoverTemplate } from '../../lib/coverLetter';
import { STARTER_BODY } from '../../lib/coverLetter';
import type { InboxRow } from '../../lib/inbox';
import { nextInterviewLine, type CalendarCommand, type CalendarRow } from '../../lib/calendar';
import { companyLookup } from '../../lib/overview';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { LiveTable } from '../../hooks/useLiveTable';
import type { Page } from '../../hooks/useRoute';
import { useSavedJobs } from '../../hooks/useSavedJobs';
import { useNow } from '../../hooks/useNow';
import { useResumeActivated } from '../../hooks/useResumes';
import { APPLICATION_STATUSES, WORKING_STATES, displayName, isOnline, statusInfo } from '../../lib/format';
import { atCompany, filterJobs, sortJobs } from '../../lib/jobs';
import { mergeProfile, profileProgress } from '../../lib/profile';
import { activeResume } from '../../lib/resume';
import { confetti } from '../../lib/confetti';
import { AgentPage } from '../agent/AgentPage';
import { agentTone, useLogTail } from '../agent/live';
import { ApplicationsPage } from '../applications/ApplicationsPage';
import { UpcomingCard } from '../calendar/UpcomingCard';
import { Callout, SkeletonPanel } from '../common';
import { ConfirmSubmit } from '../ConfirmSubmit';
import { IconUser } from '../Icons';
import { InboxView } from '../inbox/InboxPage';
import { ActionBar } from '../jobs/ActionBar';
import { JobsPage, NO_JOB_FILTERS } from '../jobs/JobsPage';
import { cityPoint, statesOf } from '../../lib/geo';
import { LettersView, type LettersActions } from '../letters/CoverLettersPage';
import { Lightbox } from '../Lightbox';
import { MemoryPage } from '../memory/MemoryPage';
import { PreferencesView } from '../PreferencesPage';
import { RulesView, type RulesActions } from '../rules/RulesPage';
import type { RuleRow } from '../../lib/rules';
import { ProfilePage } from '../profile/ProfilePage';
import { SetupPage, type SetupStart } from '../setup/SetupPage';
import { LiveCallout, OfflineCallout } from '../shell/Notices';
import { PageHeader } from '../shell/PageHeader';
import { PAGE_META } from '../shell/pages';
import { Shell } from '../shell/Shell';
import type { AgentCardProps, Marks } from '../shell/Sidebar';
import { statusWords } from '../shell/StatusControls';
import { BootError, BootSplash } from '../Splash';
import { Toasts, useToasts } from '../Toasts';
import { mockPdfUrl } from './mockPdf';
import { PageTransition } from './PageTransition';

const CompaniesPage = lazy(() => import('../companies/CompaniesPage'));
const CalendarView = lazy(() => import('../calendar/CalendarPage').then((m) => ({ default: m.CalendarView })));
const OverviewPage = lazy(() => import('../overview/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const ProfileWizard = lazy(() => import('../profile/ProfileWizard').then((m) => ({ default: m.ProfileWizard })));

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();
const isoAhead = (mins: number) => new Date(Date.now() + mins * 60000).toISOString();

/** A stand-in screenshot: a plain form page drawn as an SVG. */
const SHOT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000' viewBox='0 0 800 1000'><rect width='800' height='1000' fill='#ffffff'/><rect x='60' y='60' width='300' height='28' rx='6' fill='#15181c'/>${[160, 250, 340, 430, 520]
    .map((y) => `<rect x='60' y='${y}' width='180' height='14' rx='3' fill='#cdd2d8'/><rect x='60' y='${y + 24}' width='680' height='40' rx='8' fill='none' stroke='#e1e4e8' stroke-width='2'/>`)
    .join('')}<rect x='60' y='640' width='200' height='48' rx='10' fill='#15181c'/></svg>`,
)}`;

/** Real domains, so logos and the Companies page's job counts can be checked. */
const COMPANIES: [raw: string, name: string, domain: string, title: string, location: string, score: number, foundMins: number][] = [
  ['stripe', 'Stripe', 'stripe.com', 'Software Engineering Intern, Payments', 'San Francisco, CA; Seattle, WA; Remote', 4.9, 40],
  ['cisco/wd5/cisco_careers', 'Cisco', 'cisco.com', 'Software Engineer Full-Stack / Backend I (Intern), United States', 'San Jose, California, US; Austin, Texas, US; RTP, North Carolina, US', 4.8, 300],
  ['datadog', 'Datadog', 'datadoghq.com', 'Software Engineer Intern, Backend', 'New York, NY', 4.7, 90],
  ['elevenlabs', 'ElevenLabs', 'elevenlabs.io', 'Machine Learning Engineer Intern, Voice', 'Remote; London, United Kingdom', 4.6, 2000],
  ['cloudflare', 'Cloudflare', 'cloudflare.com', 'Systems Engineer Intern, Infrastructure', 'Austin, TX', 4.4, 1300],
  ['ramp', 'Ramp', 'ramp.com', 'Frontend Engineer Intern', 'New York, NY', 4.3, 3000],
  ['robinhood', 'Robinhood', 'robinhood.com', 'Data Science Intern', 'Menlo Park, CA', 4.1, 4200],
  ['coinbase', 'Coinbase', 'coinbase.com', 'Software Engineer Intern, Mobile (iOS)', 'Remote', 3.9, 600],
  ['stripe', 'Stripe', 'stripe.com', 'Data Engineering Intern', 'Remote', 3.8, 5000],
  ['DTCC Candidate Experience Site', 'DTCC', 'dtcc.com', 'Software Engineer Intern', 'Tampa, FL, United States', 3.6, 7000],
  ['The Cadmus Group, Inc.', 'Cadmus', 'cadmusgroup.com', 'Jr. Full Stack Developer Intern', 'Arlington, VA', 3.2, 8000],
  ['Northwind Labs', '', '', 'QA Automation Intern', 'Chicago, IL', 2.6, 9000],
];

function job(id: string, raw: string, name: string, domain: string, title: string, location: string, score: number, rest: Partial<JobRow> = {}): JobRow {
  return {
    id,
    title,
    company: raw,
    company_name: name,
    company_domain: domain,
    location,
    url: 'https://example.com',
    score,
    status: 'scored',
    note: '',
    reason: '',
    screenshot_path: '',
    dry_run: false,
    updated_at: iso(5),
    found_at: null,
    ...rest,
  };
}

/** A small seeded random, so the mock history is the same on every load. */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const MORE: [raw: string, name: string, domain: string][] = [
  ['notion', 'Notion', 'notion.so'],
  ['figma', 'Figma', 'figma.com'],
  ['linear', 'Linear', 'linear.app'],
  ['vercel', 'Vercel', 'vercel.com'],
  ['airbnb', 'Airbnb', 'airbnb.com'],
  ['duolingo', 'Duolingo', 'duolingo.com'],
  ['palantir', 'Palantir', 'palantir.com'],
  ['nvidia', 'NVIDIA', 'nvidia.com'],
  ['datadog', 'Datadog', 'datadoghq.com'],
  ['stripe', 'Stripe', 'stripe.com'],
  ['ramp', 'Ramp', 'ramp.com'],
  ['cloudflare', 'Cloudflare', 'cloudflare.com'],
];
const MORE_TITLES = [
  'Software Engineer Intern',
  'Backend Engineer Intern, Platform',
  'Machine Learning Intern, Ranking',
  'Data Engineering Intern',
  'Frontend Engineer Intern, Design Systems',
  'iOS Engineer Intern',
  'Software Engineer Intern, Infrastructure',
  'Data Analyst Intern',
];
const MORE_PLACES = ['New York, NY', 'San Francisco, CA', 'Remote', 'Seattle, WA; Hybrid', 'Austin, TX', 'Boston, MA'];

/** Scored jobs found over the last two weeks, and applications spread over twelve. */
function history(): JobRow[] {
  const rnd = seeded(7);
  const out: JobRow[] = [];
  for (let i = 0; i < 30; i++) {
    const [raw, name, domain] = MORE[Math.floor(rnd() * MORE.length)];
    const score = Math.round((1.4 + rnd() * 3.4) * 10) / 10;
    out.push(job(`h${i}`, raw, name, domain, MORE_TITLES[Math.floor(rnd() * MORE_TITLES.length)], MORE_PLACES[Math.floor(rnd() * MORE_PLACES.length)], score, { found_at: iso(60 * (6 + rnd() * 24 * 13)) }));
  }
  for (let i = 0; i < 26; i++) {
    const [raw, name, domain] = MORE[Math.floor(rnd() * MORE.length)];
    // More lately than at the start: the hunt picked up.
    const daysAgo = Math.floor(Math.pow(rnd(), 1.6) * 80) + 1;
    const sentReal = rnd() < 0.55;
    out.push(
      job(`p${i}`, raw, name, domain, MORE_TITLES[Math.floor(rnd() * MORE_TITLES.length)], MORE_PLACES[Math.floor(rnd() * MORE_PLACES.length)], Math.round((3.4 + rnd() * 1.5) * 10) / 10, {
        status: sentReal ? 'submitted' : 'blocked',
        reason: sentReal ? '' : 'dry_run',
        dry_run: !sentReal,
        note: sentReal ? 'Confirmation page reached.' : 'Dry run: filled, nothing sent.',
        updated_at: iso(daysAgo * 1440 - Math.floor(rnd() * 600)),
        found_at: iso((daysAgo + 2) * 1440),
      }),
    );
  }
  return out;
}

function mockJobs(): JobRow[] {
  const jobs = COMPANIES.map(([raw, name, domain, title, location, score, mins], i) => job(`j${i}`, raw, name, domain, title, location, score, { found_at: iso(mins) }));
  jobs.push(
    job('a1', 'Boeing', 'Boeing', 'boeing.com', 'Software Engineer Intern, Associate', 'Seattle, WA', 4.2, { status: 'applying', updated_at: iso(1) }),
    job('a2', 'Snap Inc.', 'Snap', 'snap.com', 'Software Engineer Intern, Infrastructure', 'Seattle, WA', 4.4, { status: 'submitted', note: 'Confirmation page reached.', screenshot_path: SHOT, updated_at: iso(30) }),
    job('a3', 'elevenlabs', 'ElevenLabs', 'elevenlabs.io', 'Software Engineer Intern, Full Stack', 'Remote', 4.6, {
      status: 'blocked',
      reason: 'dry_run',
      dry_run: true,
      screenshot_path: SHOT,
      note: "Dry run (AGENT_DRY_RUN is set): filled, send control button[type='submit'] found, nothing sent.\nFilled required fields with the profile name, email and phone. Uploaded resume.pdf. Answered 3 open questions from Memory.",
      updated_at: iso(80),
    }),
    job('a4', 'verkada', 'Verkada', 'verkada.com', 'Software Engineer Intern, Backend', 'San Mateo, CA', 4.0, { status: 'blocked', reason: 'closed', dry_run: true, note: "The posting redirects to the employer's job board error page.", updated_at: iso(1500) }),
    job('a5', 'g2i', 'G2i', 'g2i.co', 'Frontend Engineer Intern', 'Remote', 3.8, { status: 'unconfirmed', note: 'Pressed submit; no confirmation page appeared.', updated_at: iso(2900) }),
    job('a6', 'scopely', 'Scopely', 'scopely.com', 'Data Engineer Intern', 'Culver City, CA', 3.5, { status: 'failed', reason: 'form_not_loaded', note: 'The form timed out on page 3.', updated_at: iso(4400) }),
    job('a7', 'Northwind Labs', '', '', 'QA Engineer Intern', 'Remote', 3.1, { status: 'blocked', reason: 'missing_info', note: 'The form asks for a security clearance level.', updated_at: iso(5900) }),
    job('a8', 'jobgether', 'Jobgether', 'jobgether.com', 'Platform Engineer Intern', 'Remote', 3.4, { status: 'refused', note: 'The form rejected the phone number format.', updated_at: iso(8700) }),
    ...history(),
  );
  return jobs;
}

type Mode = 'applying' | 'scoring' | 'searching' | 'reading' | 'ready' | 'paused' | 'offline' | 'error';
const MODES: Mode[] = ['applying', 'scoring', 'searching', 'reading', 'ready', 'paused', 'offline', 'error'];
const MODE_MESSAGE: Record<Mode, string> = {
  applying: '1/2 Boeing: Software Engineer Intern, Associate: filling page 2',
  scoring: 'Scoring 12/40: Stripe, Software Engineering Intern, Payments',
  searching: 'Downloading the newest postings',
  reading: 'Reading resume_2026.pdf',
  ready: 'Waiting for jobs',
  paused: 'Paused',
  offline: '',
  error: 'The browser closed before the form loaded.',
};

const AGENT: AgentRow = {
  user_id: 'u',
  state: 'applying',
  message: MODE_MESSAGE.applying,
  resume_name: 'resume_2026.pdf',
  model: 'gpt-5-mini',
  jobs_found: 1284,
  jobs_scored: 312,
  last_seen: iso(0),
  fetched_at: iso(47),
  next_fetch_at: isoAhead(133),
  fetched_new: 12,
};

const MEMORY: MemoryRow[] = [
  { id: 1, question: 'Why do you want to work at ElevenLabs?', answer: 'I have been building voice tools on the side for two years, and your API is the one I reach for first. I want to work on the platform that made those projects possible, and help it scale to the next million developers.', source: 'learned', pinned: true, company: 'elevenlabs', job_title: 'Software Engineer, Full Stack', job_id: 'a3', created_at: iso(80), updated_at: iso(80) },
  { id: 2, question: 'Are you legally authorized to work in the United States?', answer: 'Yes.', source: 'user', pinned: true, company: '', job_title: '', job_id: '', created_at: iso(3000), updated_at: iso(3000) },
  { id: 3, question: 'Describe a project you are proud of.', answer: 'An agent that scores job postings against my resume and fills the applications in a real browser. It runs on my laptop, reports to a dashboard, and never sends anything in dry run.', source: 'learned', pinned: false, company: 'cisco/wd5/cisco_careers', job_title: 'Software Engineer Intern', job_id: 'j1', created_at: iso(200), updated_at: iso(200) },
  { id: 4, question: 'How did you hear about this role?', answer: 'Company website.', source: 'learned', pinned: false, company: 'verkada', job_title: 'Software Engineer, Backend', job_id: 'a4', created_at: iso(140), updated_at: iso(140) },
];

const INBOX: InboxRow[] = [
  { user_id: 'u', id: 'i1', company: 'Stripe', role: 'Software Engineering Intern', status: 'interview', applied_at: iso(9000), updated_at: iso(120), subject: 'Next steps: technical interview', mails: 4, by_agent: true, synced_at: iso(14) },
  { user_id: 'u', id: 'i2', company: 'Snap', role: 'Software Engineer Intern, Infrastructure', status: 'assessment', applied_at: iso(4000), updated_at: iso(600), subject: 'Your HackerRank assessment for Snap', mails: 2, by_agent: true, synced_at: iso(14) },
  { user_id: 'u', id: 'i3', company: 'Datadog', role: 'Software Engineer Intern', status: 'applied', applied_at: iso(2000), updated_at: iso(2000), subject: 'Thanks for applying to Datadog', mails: 1, by_agent: false, synced_at: iso(14) },
  { user_id: 'u', id: 'i4', company: 'Robinhood', role: 'Data Science Intern', status: 'rejected', applied_at: iso(20000), updated_at: iso(7000), subject: 'Update on your application', mails: 2, by_agent: true, synced_at: iso(14) },
  { user_id: 'u', id: 'i5', company: 'Cloudflare', role: 'Systems Engineer Intern', status: 'offer', applied_at: iso(30000), updated_at: iso(50), subject: 'Offer letter: Systems Engineer Intern', mails: 6, by_agent: true, synced_at: iso(14) },
];

/** A local time a number of days from today, as ISO. */
const at = (days: number, hour: number, minute = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, minute).toISOString();
};
/** A calendar day for an all-day event: midnight UTC of that local date, the way Google gives a date. */
const dayOnly = (days: number) => {
  const d = new Date();
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())).toISOString();
};

const event = (id: string, title: string, starts: string, ends: string | null, rest: Partial<CalendarRow> = {}): CalendarRow => ({
  id,
  title,
  starts_at: starts,
  ends_at: ends,
  all_day: false,
  location: '',
  url: '',
  kind: 'other',
  company: '',
  notes: '',
  source: 'google',
  synced_at: iso(4),
  ...rest,
});

function mockEvents(): CalendarRow[] {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 3_600_000 + 14 * 60_000);
  return [
    event('e1', 'Recruiter call with Datadog', soon.toISOString(), new Date(soon.getTime() + 30 * 60_000).toISOString(), { kind: 'call', company: 'Datadog', location: 'Phone', notes: 'Ask about the team and the timeline.' }),
    event('e2', 'Technical interview with Stripe', at(1, 10), at(1, 10, 45), { kind: 'interview', company: 'Stripe', url: 'https://meet.google.com/abc-defg-hij', notes: 'Payments team, one coding round.' }),
    event('e3', 'Snap online assessment due', dayOnly(2), dayOnly(3), { all_day: true, kind: 'deadline', company: 'Snap Inc.', url: 'https://www.hackerrank.com/test/snap' }),
    event('e4', 'Cloudflare offer call', at(3, 15, 30), at(3, 16), { kind: 'call', company: 'Cloudflare', url: 'https://zoom.us/j/123456789', source: 'web' }),
    event('e5', 'Ramp take-home', at(5, 9), at(5, 11), { kind: 'assessment', company: 'Ramp' }),
    event('e6', 'Final round with Stripe', at(9, 13), at(9, 15), { kind: 'interview', company: 'Stripe', location: '510 Townsend St, San Francisco', source: 'agent' }),
    event('e7', 'Dentist', at(1, 16), at(1, 17), { location: 'Tampa' }),
    event('e8', 'Data Structures lecture', at(2, 11), at(2, 12, 15), { location: 'ENB 109' }),
    event('e9', 'Bulls Hack planning', at(4, 18), at(4, 19)),
    event('e10', 'Interview with Robinhood', at(-3, 14), at(-3, 14, 45), { kind: 'interview', company: 'Robinhood', url: 'https://meet.google.com/xyz-abcd-efg' }),
    event('e11', 'Coffee chat with a Cisco engineer', at(-1, 9), at(-1, 9, 30), { kind: 'call', company: 'Cisco' }),
  ];
}

const PROFILE_DATA = {
  personal: { first_name: 'Alex', last_name: 'Rivera', email: 'alex.rivera@usf.edu', phone: '+1 813 555 0142', city: 'Tampa', state: 'FL', country: 'United States', linkedin: 'linkedin.com/in/alexrivera', github: 'github.com/alexrivera' },
  education: [{ school: 'University of South Florida', degree: 'B.S.', field: 'Computer Science', gpa: '3.7', start: '2023-08', end: '2027-05' }],
  experience: [
    { company: 'Tampa Bay Robotics Lab', title: 'Software Intern', location: 'Tampa, FL', start: '2025-05', end: '2025-08', description: 'Built a telemetry dashboard used by 40 people\nCut report time from 2 hours to 10 minutes' },
    { company: 'USF Bulls Hack', title: 'Organizer', location: 'Tampa, FL', start: '2024-09', end: 'Present', description: 'Ran a 300 person hackathon' },
  ],
  skills: ['Python', 'TypeScript', 'React', 'SQL', 'Go', 'Docker'],
  preferences: { desired_roles: 'Software engineering intern', desired_locations: 'Tampa, Remote', work_mode: 'Any' },
  authorization: { countries: ['United States'], authorized_us: 'Yes', needs_sponsorship: '' },
};

const PROFILE_ROW: ProfileRow = { user_id: 'u', data: PROFILE_DATA, completed: false, updated_by: 'web', updated_at: iso(600) };

const RESUME_DATA = {
  search: { titles: ['Software Engineer Intern', 'Backend Engineer Intern', 'Data Engineer Intern'], cities: ['Tampa, FL', 'New York, NY'], countries: ['United States'], goals: 'Backend or data internships for summer 2027, remote is fine.' },
  profile: { personal: PROFILE_DATA.personal, education: PROFILE_DATA.education, experience: PROFILE_DATA.experience, skills: PROFILE_DATA.skills },
};

/** A second resume, read for machine learning roles. */
const ML_DATA = {
  search: { titles: ['Machine Learning Intern', 'AI Engineer Intern', 'Applied Scientist Intern'], cities: ['San Francisco, CA', 'Seattle, WA'], countries: ['United States'], goals: 'ML internships, ideally on ranking or speech.' },
  profile: { ...RESUME_DATA.profile, skills: ['Python', 'PyTorch', 'NumPy', 'SQL', 'Docker', 'Hugging Face', 'scikit-learn'] },
};

const RESUME_LINES = ['Alex Rivera', 'alex.rivera@usf.edu | Tampa, FL', '', 'Education', 'University of South Florida, B.S. Computer Science, 2027', '', 'Experience', 'Tampa Bay Robotics Lab, Software Intern', 'Built a telemetry dashboard used by 40 people', '', 'Skills', 'Python, TypeScript, React, SQL, Go, Docker'];

const resumeRow = (id: number, status: string, mins: number, rest: Partial<ResumeRow> = {}): ResumeRow => ({
  id,
  name: 'resume_2026.pdf',
  label: '',
  path: '',
  size: 186_000,
  status,
  error: '',
  data: status === 'active' || status === 'old' ? RESUME_DATA : {},
  created_at: iso(mins),
  updated_at: iso(mins),
  ...rest,
});

const TEMPLATES: CoverTemplate[] = [
  { id: 'classic', name: 'Classic', description: 'Plain and short, for most applications', body: STARTER_BODY, builtin: true, updated_at: iso(9000) },
  { id: 'startup', name: 'Startup', description: 'Warmer, for small teams', body: STARTER_BODY.replace('Best regards', 'Thanks'), builtin: true, updated_at: iso(9000) },
  { id: 'mine-data', name: 'Data roles', description: 'Leads with the analytics project', body: STARTER_BODY, builtin: false, updated_at: iso(300) },
];

const LETTER_LINES = [
  'Alex Rivera',
  'alex.rivera@usf.edu | +1 813 555 0142',
  '',
  'Dear Hiring Team,',
  '',
  'I am applying for the Software Engineering Intern role on the Payments team.',
  'Last summer I built a telemetry dashboard that 40 engineers used every day,',
  'and I would like to bring the same care to the systems that move money.',
  '',
  'At the Tampa Bay Robotics Lab I cut report time from two hours to ten minutes.',
  'I write Python and TypeScript every day and I am comfortable reading logs at 2am.',
  '',
  'I would welcome a conversation about the team and the role.',
  '',
  'Best regards,',
  'Alex Rivera',
];

function letterText(company: string): string {
  return LETTER_LINES.join('\n').replace('the Payments team', `the ${company} team`);
}

const PREFS: NotifyPrefs = {
  permission: 'default',
  enabled: false,
  muted: false,
  sound: false,
  request: () => undefined,
  setMuted: () => undefined,
  setSound: () => undefined,
};

const ALL_PAGES: Page[] = ['overview', 'jobs', 'applications', 'inbox', 'calendar', 'agent', 'letters', 'companies', 'profile', 'preferences', 'rules', 'memory', 'setup'];

const rule = (id: string, kind: string, title: string, body: string, rest: Partial<RuleRow> = {}): RuleRow => ({
  id,
  kind,
  title,
  description: '',
  body,
  default_body: body,
  enabled: true,
  builtin: true,
  sort: 1,
  updated_by: 'agent',
  updated_at: iso(3000),
  ...rest,
});

/** What the agent ships, plus a few of the person's own. */
function mockRules(): RuleRow[] {
  const letter: [string, string, string][] = [
    ['Only true facts', 'Nothing the resume and profile do not say.', 'Use only facts from the resume and the profile. Never invent a number, a tool or a result.'],
    ['Match the job with proof', 'Two duties from the posting, each with evidence.', 'Pick two things the posting asks for and show a result from the resume for each.'],
    ['Why this company', 'One specific reason, not a compliment.', 'Name one product, paper or team of the company and tie it to something I built.'],
    ['Sound like a person', 'Plain words, short sentences.', 'Write like a student writing to a person. No buzzwords, no "I am thrilled".'],
    ['Keep it light on tech', 'At most two tool names.', 'Name at most two tools. A recruiter reads it first, not an engineer.'],
    ["Speak the posting's language", "Use the posting's own words for the role.", 'When the posting names a skill, use the same words for it.'],
    ['Handle what is missing', 'Say less rather than guess.', 'When the resume has nothing for a requirement, leave it out instead of stretching.'],
    ['Fill the slot', 'Write exactly what each generated part asks for.', "Follow each part's note for length and content."],
  ];
  return [
    ...letter.map(([title, description, body], i) =>
      rule(`cover-letter/${i}`, 'cover_letter', title, body, {
        description,
        sort: i,
        ...(i === 3 ? { body: 'Write like a student writing to a person. Contractions are fine. No buzzwords.', updated_by: 'web', updated_at: iso(200) } : {}),
        ...(i === 6 ? { enabled: false, updated_by: 'web' } : {}),
      }),
    ),
    rule('cover-letter/mine-hackathon-k2x9', 'cover_letter', 'Mention the hackathon', 'When the team builds developer tools, mention organizing USF Bulls Hack.', { description: 'For developer tools teams', builtin: false, default_body: '', sort: 9, updated_by: 'web' }),
    rule('section/opening', 'section', 'opening', 'Start with the role name and one line on why I fit it.', { builtin: false, default_body: '', updated_by: 'web' }),
    rule('answer/why-this-company', 'answer', 'Why this company', 'Name one thing they built that I used, then the project of mine it relates to.', { builtin: false, default_body: '', sort: 0, updated_by: 'web' }),
    rule('answer/salary-expectations', 'answer', 'Salary expectations', 'Say I am flexible and focused on learning, unless a number is required.', { builtin: false, default_body: '', sort: 5, updated_by: 'web', enabled: false }),
    rule(
      'always/builtin',
      'always',
      'Built-in instructions',
      [
        'Write in the first person.',
        'Never claim work authorization the profile does not state.',
        'Keep answers under the length the form allows.',
        'Do not mention salary unless asked.',
        'Never send anything in a dry run.',
      ].join('\n'),
      { description: 'What the agent always follows.', sort: 0 },
    ),
    rule('always/american-spelling-a1b2', 'always', 'American spelling', 'Use American spelling everywhere.', { builtin: false, default_body: '', sort: 50, updated_by: 'web' }),
  ];
}

const table = <T,>(rows: T[], loading: boolean, error: LiveTable<T>['error'] = null): LiveTable<T> => ({ rows, loading, error, live: 'live', reload: () => undefined });

export default function Preview() {
  const [page, setPage] = useState<Page>('overview');
  const [company, setCompany] = useState<string | null>(null);
  const [companyParams, setCompanyParams] = useState(() => new URLSearchParams());
  const [screen, setScreen] = useState<'app' | 'splash' | 'error'>('app');
  const [jobs, setJobs] = useState<JobRow[]>(mockJobs);
  const [mode, setMode] = useState<Mode>('applying');
  const [agentBase, setAgentBase] = useState<AgentRow>(AGENT);
  const [settings, setSettings] = useState<AgentSettings>({ paused: false, auto_fetch: true, fetch_hours: 3, fetch_limit: 40 });
  const [oldDb, setOldDb] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState(NO_JOB_FILTERS);
  const [noInbox, setNoInbox] = useState(false);
  const [events, setEvents] = useState<CalendarRow[]>(mockEvents);
  const [noEvents, setNoEvents] = useState(false);
  const [calCommands, setCalCommands] = useState<CalendarCommand[]>(() => [
    {
      id: 90,
      kind: 'calendar_add',
      payload: { title: 'Mock interview with a friend', starts_at: at(6, 17), ends_at: at(6, 17, 45), all_day: false, kind: 'interview', company: '', location: 'Library', url: '', notes: '' },
      status: 'failed',
      error: 'Google Calendar refused the event: the calendar is read only.',
      created_at: iso(30),
    },
  ]);
  const [dryRun, setDryRun] = useState(true);
  const [confirm, setConfirm] = useState<JobRow[] | null>(null);
  const [shot, setShot] = useState<{ job: JobRow; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [resumes, setResumes] = useState<ResumeRow[]>(() => [
    resumeRow(3, 'active', 4300, { label: 'Backend' }),
    resumeRow(6, 'reading', 2, { name: 'resume_data_2026.pdf', label: 'Data', size: 171_000 }),
    resumeRow(5, 'old', 9000, { name: 'resume_ml.pdf', label: 'ML', size: 203_000, data: ML_DATA }),
    resumeRow(1, 'old', 30000, { name: 'resume_old.pdf' }),
    resumeRow(2, 'failed', 20000, { name: 'scan.pdf', error: 'The PDF is a scanned image with no text in it.' }),
  ]);
  // A small PDF for Open, made once.
  useEffect(() => {
    const url = mockPdfUrl(RESUME_LINES);
    setResumes((list) => list.map((r) => (r.path ? r : { ...r, path: url })));
    return () => URL.revokeObjectURL(url);
  }, []);
  const [setupKey, setSetupKey] = useState(0);
  const [setupStart, setSetupStart] = useState<SetupStart | undefined>(undefined);
  const [letters, setLetters] = useState<CoverLetterRow[]>([]);
  const [lettersSettings, setLettersSettings] = useState<CoverSettings>({ user_id: 'u', enabled: true, template_id: 'classic', updated_at: iso(300) });
  const [templates, setTemplates] = useState<CoverTemplate[]>(TEMPLATES);
  const [rules, setRules] = useState<RuleRow[]>(mockRules);
  const [wizard, setWizard] = useState<{ open: boolean; key: number; step: number }>({ open: false, key: 0, step: 0 });
  const [prefsRow, setPrefsRow] = useState<PreferencesRow>({ user_id: 'u', tone: 'Warm', length: 'Medium', highlight: 'Distributed systems, data pipelines', avoid: 'Salary expectations', notes: '', sample: '', learn: true, updated_at: iso(900) });
  const { toasts, push, dismiss } = useToasts();
  const { saved, toggle: toggleSaved } = useSavedJobs();
  const now = useNow(2000);

  // The PDF for the first letter, made once.
  useEffect(() => {
    const url = mockPdfUrl(LETTER_LINES);
    setLetters([
      { job_id: 'j0', template_id: 'classic', body: letterText('Payments'), pdf_path: url, problems: '', updated_by: 'agent', updated_at: iso(25) },
      { job_id: 'j2', template_id: 'mine-data', body: letterText('Datadog'), pdf_path: '', problems: '', updated_by: 'agent', updated_at: iso(140) },
      { job_id: 'j4', template_id: 'startup', body: letterText('Cloudflare'), pdf_path: url, problems: 'The letter names a project twice.', updated_by: 'web', updated_at: iso(600) },
      ...[3, 5, 8, 9, 12, 16, 23, 30, 41].map((d, i) => ({ job_id: `p${i}`, template_id: 'classic', body: letterText('Platform'), pdf_path: '', problems: '', updated_by: 'agent', updated_at: iso(d * 1440 + 200) })),
    ]);
    return () => URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const offline = mode === 'offline';
  // The heartbeat follows the clock, so the mock agent stays online while the page is open.
  const agent: AgentRow = {
    ...agentBase,
    state: offline ? 'idle' : mode === 'ready' ? 'idle' : mode,
    message: offline ? '' : MODE_MESSAGE[mode],
    last_seen: new Date(now - (offline ? 180 * 60000 : 1500)).toISOString(),
  };
  const online = isOnline(agent.state, agent.last_seen, now);
  const state = online ? agent.state : 'offline';
  const tail = useLogTail(agent);
  const working = online && WORKING_STATES.includes(state);
  const isSearching = searching || (online && (state === 'searching' || state === 'scoring'));

  const candidates = useMemo(() => jobs.filter((j) => j.status === 'scored'), [jobs]);
  const home = useMemo(() => cityPoint('Tampa', 'FL'), []);
  const jobStates = useMemo(() => [...new Set(candidates.flatMap((job) => statesOf(job.location)))], [candidates]);
  const visible = useMemo(() => sortJobs(filterJobs(candidates, { ...filters, company, saved, now, home }), filters.sort), [candidates, filters, company, saved, home]);
  const applications = jobs.filter((j) => APPLICATION_STATUSES.includes(j.status)).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const sent = applications.filter((j) => ['sent', 'unconfirmed'].includes(statusInfo(j).tone)).length;
  const current = online ? applications.find((j) => j.status === 'applying') ?? null : null;
  const commands: CommandRow[] = [
    { id: 4, kind: 'resume', job_ids: [], dry_run: true, status: 'done', error: '', created_at: iso(4300) },
    { id: 3, kind: 'cover_letter', job_ids: ['j1', 'j2'], dry_run: true, status: 'pending', error: '', created_at: iso(1) },
    { id: 2, kind: 'apply', job_ids: ['a1', 'a2'], dry_run: true, status: 'running', error: '', created_at: iso(2) },
    { id: 1, kind: 'search', job_ids: [], dry_run: false, status: 'done', error: '', created_at: iso(40) },
    { id: 0, kind: 'apply', job_ids: ['a6'], dry_run: false, status: 'failed', error: 'The browser closed before the form loaded.', created_at: iso(400) },
  ];
  const memory: LiveTable<MemoryRow> = table(MEMORY, loading);
  const profile = useMemo(() => mergeProfile(PROFILE_ROW.data), []);
  const profileComplete = PROFILE_ROW.completed && profileProgress(profile).every((s) => s.done);
  const active = activeResume(resumes);
  const hasResume = Boolean(active);
  const setupMark = { done: hasResume && profileComplete, progress: ((hasResume ? 1 : 0) + (profileComplete ? 1 : 0)) / 2, label: '1 of 2 done' };
  const resumesTable = { rows: resumes, loading, error: oldDb ? { kind: 'missing-table' as const, message: 'missing' } : null };

  useResumeActivated(resumes, !loading, (row) => {
    confetti();
    push({ tone: 'ok', title: 'Resume ready', detail: row.name });
  });

  const setResume = useCallback((id: number, patch: Partial<ResumeRow>) => setResumes((list) => list.map((r) => (r.id === id ? { ...r, ...patch, updated_at: iso(0) } : r))), []);

  /** Puts a fresh resume row in the given state and remounts Set up following it. */
  const setupState = (status: 'uploaded' | 'reading' | 'active' | 'failed') => {
    const id = Date.now();
    const first = status === 'active' ? 'reading' : status;
    setResumes((list) => [resumeRow(id, first, 0, { name: 'resume_fall_2026.pdf', error: status === 'failed' ? 'The file is password protected.' : '' }), ...list.map((r) => (r.status === 'active' && status === 'active' ? r : r))]);
    setSetupStart({ trackedId: id });
    setSetupKey((k) => k + 1);
    setPage('setup');
    if (status === 'active') {
      window.setTimeout(() => {
        setResumes((list) => list.map((r) => (r.id === id ? { ...r, status: 'active', data: RESUME_DATA } : r.status === 'active' ? { ...r, status: 'old' } : r)));
      }, 900);
    }
  };

  const uploadFlow = (file: File): Promise<number> =>
    new Promise((resolve) => {
      window.setTimeout(() => {
        const id = Date.now();
        setResumes((list) => [resumeRow(id, 'uploaded', 0, { name: file.name, size: file.size }), ...list]);
        resolve(id);
        window.setTimeout(() => setResume(id, { status: 'reading' }), 1600);
        window.setTimeout(() => setResumes((list) => list.map((r) => (r.id === id ? { ...r, status: 'active', data: RESUME_DATA } : r.status === 'active' ? { ...r, status: 'old' } : r))), 5200);
      }, 1400);
    });

  const lettersActions: LettersActions = {
    saveSettings: async (enabled, templateId) => setLettersSettings((s) => ({ ...s, enabled, template_id: templateId })),
    saveTemplate: async (t) => setTemplates((list) => [...list.filter((x) => x.id !== t.id), { ...t, builtin: false, updated_at: iso(0) }]),
    deleteTemplate: async (id) => setTemplates((list) => list.filter((t) => t.id !== id)),
    saveLetter: async (jobId, body) => setLetters((list) => list.map((l) => (l.job_id === jobId ? { ...l, body, updated_by: 'web', updated_at: iso(0) } : l))),
    sendLetters: async (jobIds, fresh) => {
      if (fresh) setLetters((list) => list.filter((l) => !jobIds.includes(l.job_id)));
      window.setTimeout(() => {
        const url = mockPdfUrl(LETTER_LINES);
        setLetters((list) => list.map((l) => (jobIds.includes(l.job_id) ? { ...l, pdf_path: url, updated_at: new Date().toISOString() } : l)));
      }, online ? 2600 : 999_999);
    },
  };

  const rulesActions: RulesActions = {
    save: async (r) => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      setRules((list) => {
        const old = list.find((x) => x.id === r.id);
        const next: RuleRow = { ...(old ?? rule(r.id, r.kind, r.title, r.body, { builtin: false, default_body: '' })), ...r, updated_by: 'web', updated_at: iso(0) } as RuleRow;
        return old ? list.map((x) => (x.id === r.id ? next : x)) : [...list, next];
      });
    },
    reset: async (r) => {
      setRules((list) => list.map((x) => (x.id === r.id ? { ...x, body: x.default_body, enabled: true, updated_by: 'agent', updated_at: iso(0) } : x)));
    },
    remove: async (id) => setRules((list) => list.filter((x) => x.id !== id)),
  };

  const finish = (live: boolean) => {
    setJobs((list) => list.map((j) => (j.status === 'applying' ? { ...j, status: 'submitted', dry_run: !live, note: 'Confirmation page reached.', screenshot_path: SHOT, updated_at: iso(0) } : j)));
    push({ tone: 'ok', title: live ? 'Sent to Boeing' : 'Filled at Boeing (dry run)' });
    if (live) confetti();
  };
  const newJob = () => {
    const n = jobs.length;
    setJobs((list) => [job(`n${n}`, 'jobgether', 'Jobgether', 'jobgether.com', 'AI Engineer Intern, Agents', 'Remote; United States', 4.8, { updated_at: iso(0), found_at: iso(0) }), ...list]);
    push({ tone: 'info', title: 'New job found', detail: 'Jobgether' });
  };
  const search = () => {
    setSearching(true);
    window.setTimeout(() => {
      setSearching(false);
      newJob();
    }, 3200);
  };
  const reset = () => {
    setJobs(mockJobs());
    setSelected(new Set());
    setFilters(NO_JOB_FILTERS);
    setCompany(null);
  };

  const agentCard: AgentCardProps = {
    agent,
    online,
    loading: false,
    now,
    settings,
    settingsOff: oldDb,
    onSettings: (patch: Partial<AgentSettings>) => {
      setSettings((s) => ({ ...s, ...patch }));
      if ('paused' in patch) setMode(patch.paused ? 'paused' : 'ready');
    },
    searching: isSearching,
    onSearch: search,
  };
  const tone = agentTone(online, state);
  const words = statusWords(agent, online, false, now, tone);
  const toggleOne = (id: string) =>
    setSelected((sel) => {
      const n = new Set(sel);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const queuedIds = new Set(['j10']);
  const dock = (
    <ActionBar
      count={selected.size}
      dryRun={dryRun}
      online={online}
      applying={false}
      onApply={() => {
        const chosen = candidates.filter((j) => selected.has(j.id));
        if (dryRun) {
          push({ tone: 'ok', title: `${chosen.length} jobs queued for dry run` });
          setSelected(new Set());
        } else setConfirm(chosen);
      }}
      onLetters={() => push({ tone: 'ok', title: `Writing ${selected.size} letters` })}
      writing={false}
      onClear={() => setSelected(new Set())}
    />
  );
  const marks: Marks = {
    jobs: { node: <span className="navcount num">{candidates.length}</span>, label: `${candidates.length} jobs` },
    applications: { node: <span className="navcount num">1</span>, label: '1 in progress' },
    profile: { node: <span className="navdot navdot--ember" />, label: 'incomplete' },
  };
  const companyLabel = company ? displayName(candidates.find((j) => atCompany(j, company)) ?? { company }) : '';

  if (screen !== 'app') {
    return (
      <>
        {screen === 'splash' ? <BootSplash /> : <BootError message="Invalid login credentials" onRetry={() => setScreen('app')} />}
        <div className="devbar devbar--float">
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('app')}>
            Back
          </button>
        </div>
      </>
    );
  }

  const meta = PAGE_META[page];
  let header: ReactNode = <PageHeader title={meta.title} subtitle={meta.sub} />;
  let content: ReactNode;
  let pageBar: ReactNode = null;
  const finishBar = (
    <>
      <button type="button" className="btn btn--sm btn--primary" onClick={() => finish(false)}>
        Finish (dry run)
      </button>
      <button type="button" className="btn btn--sm btn--ember" onClick={() => finish(true)}>
        Finish (sent)
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={newJob}>
        New job
      </button>
    </>
  );
  const notices = (applying: boolean) => (
    <>
      {applying && !dryRun ? <LiveCallout /> : null}
      {!online ? <OfflineCallout /> : null}
      {applying ? (
        <Callout
          tone="yellow"
          icon={<IconUser size={16} />}
          action={
            <button type="button" className="btn btn--primary btn--sm">
              Finish
            </button>
          }
        >
          <strong>Profile incomplete.</strong> Needed before applying.
        </Callout>
      ) : null}
    </>
  );
  switch (page) {
    case 'overview':
      header = null;
      pageBar = (
        <>
          {finishBar}
          <button type="button" className={`btn btn--sm ${noInbox ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setNoInbox((v) => !v)}>
            Empty inbox
          </button>
        </>
      );
      content = (
        <>
          <OverviewPage
            firstName={PROFILE_DATA.personal.first_name}
            agent={agent}
            tone={tone}
            state={state}
            line={words.line}
            jobs={jobs}
            candidates={candidates}
            jobsLoading={loading}
            jobsError={null}
            letters={letters}
            inbox={noInbox ? [] : INBOX}
            inboxLoading={loading}
            inboxMissing={oldDb}
            commands={commands}
            now={now}
            searching={isSearching}
            onSearch={search}
            onReviewStrong={() => {
              setFilters({ ...NO_JOB_FILTERS, minScore: 4 });
              setPage('jobs');
            }}
            onNavigate={setPage}
            selected={selected}
            queued={queuedIds}
            onToggle={toggleOne}
            notices={notices(false)}
            upcoming={oldDb ? null : <UpcomingCard rows={noEvents ? [] : events} now={now} loading={loading} lookup={companyLookup(jobs)} onOpen={() => setPage('calendar')} />}
            briefExtra={noEvents ? '' : nextInterviewLine(events, now, (c) => companyLookup(jobs)(c)?.name ?? c)}
          />
          {dock}
        </>
      );
      break;
    case 'jobs': {
      pageBar = finishBar;
      const narrowed = filters.query !== '' || filters.minScore !== 0 || filters.newOnly || filters.savedOnly || Boolean(company);
      header = <PageHeader title={meta.title} subtitle={meta.sub} count={loading ? undefined : narrowed ? `${visible.length} of ${candidates.length}` : candidates.length} />;
      content = (
        <JobsPage
              states={jobStates}
              homeLabel="Tampa"
          candidates={candidates}
          visible={visible}
          loading={loading}
          error={null}
          onRetry={() => undefined}
          selected={selected}
          queued={queuedIds}
          onToggle={toggleOne}
          onToggleAll={(ids, on) => setSelected(on ? new Set(ids) : new Set())}
          saved={saved}
          onSave={toggleSaved}
          filters={{ ...filters, company }}
          onFilters={(patch) => {
            const { company: next, ...rest } = patch;
            if (next !== undefined) setCompany(next);
            if (Object.keys(rest).length) setFilters((f) => ({ ...f, ...rest }));
          }}
          onClearFilters={() => {
            setFilters(NO_JOB_FILTERS);
            setCompany(null);
          }}
          companyLabel={companyLabel}
          searching={isSearching}
          onSearch={search}
          now={now}
          notices={notices(true)}
          actionBar={dock}
        />
      );
      break;
    }
    case 'applications':
      header = <PageHeader title={meta.title} subtitle={meta.sub} count={applications.length} />;
      content = (
        <ApplicationsPage
          items={applications}
          loading={loading}
          error={null}
          onRetry={() => undefined}
          now={now}
          onOpenShot={(j, url) => setShot({ job: j, url })}
          onOpenAnswers={() => setPage('memory')}
          answerCounts={new Map([['a3', 3], ['a2', 4]])}
          dryRun={dryRun}
          online={online}
          queued={new Set(['a8'])}
          notices={!dryRun ? <LiveCallout /> : null}
          onApplyAgain={(j) => (dryRun ? push({ tone: 'ok', title: '1 job queued for dry run' }) : setConfirm([j]))}
        />
      );
      break;
    case 'calendar':
      header = null;
      pageBar = (
        <button type="button" className={`btn btn--sm ${noEvents ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setNoEvents((v) => !v)}>
          No events
        </button>
      );
      content = (
        <CalendarView
          table={table(noEvents ? [] : events, loading, oldDb ? { kind: 'missing-table', message: 'missing' } : null)}
          commands={noEvents ? [] : calCommands}
          jobs={jobs}
          inbox={INBOX}
          now={now}
          online={online}
          toast={push}
          onAdd={async (payload) => {
            const id = Date.now();
            setCalCommands((list) => [{ id, kind: 'calendar_add', payload, status: 'pending', error: '', created_at: new Date().toISOString() }, ...list]);
            // The agent adds it a moment later, when it is online.
            if (online) {
              window.setTimeout(() => {
                setEvents((list) => [...list, event(`web-${id}`, payload.title, new Date(payload.starts_at).toISOString(), payload.ends_at ? new Date(payload.ends_at).toISOString() : null, { ...payload, source: 'web' })]);
                setCalCommands((list) => list.map((c) => (c.id === id ? { ...c, status: 'done' } : c)));
              }, 2600);
            }
          }}
        />
      );
      break;
    case 'inbox':
      content = <InboxView table={table(INBOX, loading, oldDb ? { kind: 'missing-table', message: 'missing' } : null)} now={now} jobs={jobs} />;
      break;
    case 'agent':
      content = (
        <AgentPage
          agent={agent}
          online={online}
          loading={false}
          error={null}
          onRetry={() => undefined}
          now={now}
          tail={tail}
          commands={commands}
          live="live"
          sent={sent}
          current={current}
          settings={settings}
          settingsState={{ loading: false, missing: oldDb, error: null }}
          onSettings={agentCard.onSettings}
        />
      );
      pageBar = (
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => setAgentBase((a) => ({ ...a, jobs_scored: a.jobs_scored + 7, jobs_found: a.jobs_found + 31, fetched_new: (a.fetched_new ?? 0) + 3 }))}>
          Count up
        </button>
      );
      break;
    case 'letters':
      content = (
        <LettersView
          data={{
            templates: table(templates, loading),
            settings: { ...table([lettersSettings], loading), settings: lettersSettings },
            letters: table(letters, loading),
          }}
          actions={lettersActions}
          jobs={jobs}
          online={online}
          now={now}
          toast={push}
        />
      );
      break;
    case 'companies':
      header = null;
      content = (
        <CompaniesPage
          jobs={candidates}
          params={companyParams}
          setParams={(patch) =>
            setCompanyParams((p) => {
              const next = new URLSearchParams(p);
              for (const [k, v] of Object.entries(patch)) {
                if (v) next.set(k, v);
                else next.delete(k);
              }
              return next;
            })
          }
          onSeeJobs={(key) => {
            setCompany(key);
            setPage('jobs');
          }}
        />
      );
      break;
    case 'profile':
      content = loading ? (
        <SkeletonPanel count={4} />
      ) : (
        <ProfilePage
          profile={profile}
          row={PROFILE_ROW}
          onEdit={(step) => setWizard((w) => ({ open: true, key: w.key + 1, step }))}
          resume={{
            rows: oldDb ? [] : resumes,
            loading: false,
            missing: oldDb,
            agentName: agent.resume_name,
            jobsFound: agent.jobs_found,
            online,
            toast: push,
            actions: {
              upload: async (file, { label, activate }) => {
                await new Promise((resolve) => window.setTimeout(resolve, 900));
                const id = Date.now();
                setResumes((list) => [resumeRow(id, 'uploaded', 0, { name: file.name, size: file.size, label }), ...list]);
                window.setTimeout(() => setResume(id, { status: 'reading' }), 1500);
                window.setTimeout(
                  () =>
                    setResumes((list) =>
                      list.map((r) =>
                        r.id === id ? { ...r, status: activate ? 'active' : 'old', data: RESUME_DATA, updated_at: iso(0) } : activate && r.status === 'active' ? { ...r, status: 'old' } : r,
                      ),
                    ),
                  4200,
                );
              },
              makeDefault: async (row) => {
                window.setTimeout(() => setResumes((list) => list.map((r) => (r.id === row.id ? { ...r, status: 'active' } : r.status === 'active' ? { ...r, status: 'old' } : r))), 2400);
              },
              remove: async (row) => setResumes((list) => list.filter((r) => r.id !== row.id)),
              setLabel: async (row, label) => {
                await new Promise((resolve) => window.setTimeout(resolve, 300));
                setResume(row.id, { label });
              },
            },
          }}
          now={now}
          onReplace={() => setPage('setup')}
        />
      );
      break;
    case 'preferences':
      content = (
        <PreferencesView
          row={prefsRow}
          loading={loading}
          error={null}
          reload={() => undefined}
          save={(p) =>
            new Promise<void>((resolve) => {
              window.setTimeout(() => {
                setPrefsRow((r) => ({ ...r, ...p }));
                resolve();
              }, 700);
            })
          }
          onSaved={() => push({ tone: 'ok', title: 'Preferences saved' })}
          onManageMemory={() => setPage('memory')}
        />
      );
      break;
    case 'rules':
      content = (
        <RulesView
          data={{
            rules: table(rules, loading, oldDb ? { kind: 'missing-table', message: 'missing' } : null),
            templates: table(templates, loading),
            settings: { settings: lettersSettings, loading },
          }}
          actions={rulesActions}
          toast={push}
          onNavigate={setPage}
        />
      );
      break;
    case 'memory':
      content = <MemoryPage memory={memory} now={now} job={null} onClearJob={() => undefined} toast={push} jobs={jobs} />;
      break;
    case 'setup':
      header = null;
      pageBar = (
        <>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => (setSetupStart({ upload: { name: 'resume_fall_2026.pdf', size: 212_000 } }), setSetupKey((k) => k + 1))}>
            Uploading
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setupState('uploaded')}>
            Waiting
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setupState('reading')}>
            Reading
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setupState('active')}>
            Active
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setupState('failed')}>
            Failed
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => (setSetupStart({ step: 2 }), setSetupKey((k) => k + 1))}>
            Customize
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => (setSetupStart({ step: 3 }), setSetupKey((k) => k + 1))}>
            Done
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => (setSetupStart({}), setSetupKey((k) => k + 1))}>
            Drop zone
          </button>
        </>
      );
      content = (
        <SetupPage
          key={setupKey}
          start={setupStart}
          resumes={resumesTable}
          online={online}
          now={now}
          onUpload={uploadFlow}
          onDelete={async (row) => setResumes((list) => list.filter((r) => r.id !== row.id))}
          onSaveRead={async () => undefined}
          onApply={async () => {
            push({ tone: 'ok', title: 'Profile updated', detail: 'The wizard opens at Review' });
          }}
          onSeeJobs={() => setPage('jobs')}
          onEditProfile={() => push({ tone: 'info', title: 'The wizard opens here' })}
          toast={push}
        />
      );
      break;
  }

  const devbar = (
    <div className="devbar" aria-label="Preview controls">
      <span className="devbar__label">Preview</span>
      <select className="btn btn--sm btn--secondary" value={page} onChange={(e) => setPage(e.target.value as Page)} aria-label="Page">
        {ALL_PAGES.map((p) => (
          <option key={p} value={p}>
            {PAGE_META[p].title}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length])}>
        Agent: {mode}
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => setLoading((v) => !v)}>
        {loading ? 'Loaded' : 'Loading'}
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => confetti()}>
        Confetti
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'info', title: 'New answer learned', detail: 'Why do you want to work here?' })}>
        Toast
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'error', title: 'Could not queue jobs', detail: 'JWT expired' })}>
        Error
      </button>
      <button type="button" className={`btn btn--sm ${oldDb ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setOldDb((v) => !v)}>
        Old database
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('splash')}>
        Splash
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('error')}>
        Boot error
      </button>
      {pageBar}
      <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>
        Reset
      </button>
    </div>
  );

  return (
    <>
      <Shell
        page={page}
        onNavigate={setPage}
        marks={marks}
        setup={setupMark}
        agent={agentCard}
        working={working || isSearching}
        dryRun={dryRun}
        onDryRun={setDryRun}
        notify={PREFS}
        recent={applications.slice(0, 5)}
        onOpenRecent={() => setPage('applications')}
        email="alex.rivera@usf.edu"
        top={devbar}
      >
        <PageTransition pageKey={page}>
          {header}
          <Suspense fallback={<SkeletonPanel count={5} />}>{content}</Suspense>
        </PageTransition>
      </Shell>
      {wizard.key > 0 ? (
        <Suspense fallback={null}>
          <ProfileWizard
            open={wizard.open}
            openKey={wizard.key}
            startStep={wizard.step}
            reason="manual"
            row={PROFILE_ROW}
            accountEmail="alex.rivera@usf.edu"
            onClose={() => setWizard((w) => ({ ...w, open: false }))}
            onSaved={() => setWizard((w) => ({ ...w, open: false }))}
            onPersisted={() => undefined}
            onDraftError={(message) => push({ tone: 'error', title: 'Draft not saved', detail: message })}
          />
        </Suspense>
      ) : null}
      <ConfirmSubmit jobs={confirm} onCancel={() => setConfirm(null)} onConfirm={() => setConfirm(null)} />
      <Lightbox shot={shot} onClose={() => setShot(null)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
