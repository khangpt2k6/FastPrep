// The profile the agent uses to answer application forms.
// The Python agent reads these exact keys from automation_profile.data, so keep them as they are.

export type YesNo = '' | 'Yes' | 'No';
export type YesNoPrivate = '' | 'Yes' | 'No' | 'Prefer not to say';

export interface Education {
  school: string;
  degree: string;
  field: string;
  gpa: string;
  start: string;
  end: string;
}

export interface Experience {
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  description: string;
}

export interface CustomAnswer {
  question: string;
  answer: string;
}

export interface Profile {
  personal: {
    first_name: string;
    last_name: string;
    preferred_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    linkedin: string;
    github: string;
    website: string;
  };
  education: Education[];
  experience: Experience[];
  skills: string[];
  preferences: {
    desired_roles: string;
    desired_locations: string;
    work_mode: '' | 'Remote' | 'Hybrid' | 'On-site' | 'Any';
    willing_to_relocate: YesNo;
    earliest_start: string;
    desired_salary: string;
    notice_period: string;
  };
  authorization: {
    countries: string[];
    citizen_us: YesNo;
    authorized_us: YesNo;
    needs_sponsorship: YesNo;
    authorization_basis: '' | 'Citizen' | 'Permanent resident' | 'Temporary work authorization' | 'Other';
    visa_type: string;
  };
  eeo: {
    gender: '' | 'Male' | 'Female' | 'Non-binary' | 'Prefer not to say';
    pronouns: '' | 'He/Him' | 'She/Her' | 'They/Them' | 'Other' | 'Prefer not to say';
    race:
      | ''
      | 'American Indian or Alaska Native'
      | 'Asian'
      | 'Black or African American'
      | 'Native Hawaiian or Other Pacific Islander'
      | 'White'
      | 'Two or more races'
      | 'Prefer not to say';
    hispanic_latino: YesNoPrivate;
    veteran: YesNoPrivate;
    disability: YesNoPrivate;
    lgbtq: YesNoPrivate;
    sexual_orientation: string[];
  };
  extra: { how_heard: string; notes: string; custom: CustomAnswer[] };
}

export const PRESENT = 'Present';

export const OPTIONS = {
  workMode: ['Remote', 'Hybrid', 'On-site', 'Any'],
  yesNo: ['Yes', 'No'],
  yesNoPrivate: ['Yes', 'No', 'Prefer not to say'],
  basis: ['Citizen', 'Permanent resident', 'Temporary work authorization', 'Other'],
  visa: ['F-1', 'F-1 OPT', 'F-1 CPT', 'STEM OPT', 'H-1B', 'J-1', 'Green card', 'Other'],
  gender: ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
  pronouns: ['He/Him', 'She/Her', 'They/Them', 'Other', 'Prefer not to say'],
  race: [
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Native Hawaiian or Other Pacific Islander',
    'White',
    'Two or more races',
    'Prefer not to say',
  ],
  orientation: ['Heterosexual', 'Gay', 'Lesbian', 'Bisexual', 'Asexual', 'Queer', 'Pansexual', 'Prefer not to say'],
} as const;

export function emptyEducation(): Education {
  return { school: '', degree: '', field: '', gpa: '', start: '', end: '' };
}

export function emptyExperience(): Experience {
  return { company: '', title: '', location: '', start: '', end: '', description: '' };
}

export function emptyProfile(): Profile {
  return {
    personal: {
      first_name: '',
      last_name: '',
      preferred_name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      linkedin: '',
      github: '',
      website: '',
    },
    education: [],
    experience: [],
    skills: [],
    preferences: {
      desired_roles: '',
      desired_locations: '',
      work_mode: '',
      willing_to_relocate: '',
      earliest_start: '',
      desired_salary: '',
      notice_period: '',
    },
    authorization: {
      countries: [],
      citizen_us: '',
      authorized_us: '',
      needs_sponsorship: '',
      authorization_basis: '',
      visa_type: '',
    },
    eeo: {
      gender: '',
      pronouns: '',
      race: '',
      hispanic_latino: '',
      veteran: '',
      disability: '',
      lgbtq: '',
      sexual_orientation: [],
    },
    extra: { how_heard: '', notes: '', custom: [] },
  };
}

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Copies the known string keys of `from` over the template; anything else is ignored. */
function mergeFlat<T extends object>(template: T, from: unknown): T {
  if (!isPlain(from)) return template;
  const out = { ...template } as Plain;
  for (const key of Object.keys(template)) {
    if (key in from) out[key] = str(from[key]);
  }
  return out as T;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).map((s) => s.trim()).filter(Boolean);
}

function list<T extends object>(value: unknown, make: () => T): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlain).map((item) => mergeFlat(make(), item));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maps "on site" or "yes" to the exact option spelling; anything unknown becomes "". */
function choice<T extends string>(value: string, options: readonly string[]): T {
  const hit = options.find((o) => squash(o) === squash(value));
  return (hit ?? '') as T;
}

/** Loads whatever is stored (maybe partial, maybe written by the agent) over the empty shape. */
export function mergeProfile(data: unknown): Profile {
  const base = emptyProfile();
  const d = isPlain(data) ? data : {};
  const eeoIn = isPlain(d.eeo) ? d.eeo : {};
  const authIn = isPlain(d.authorization) ? d.authorization : {};
  const extra = isPlain(d.extra) ? d.extra : {};
  const prefs = mergeFlat(base.preferences, d.preferences);
  const auth = mergeFlat(base.authorization, authIn);
  const eeo = mergeFlat(base.eeo, eeoIn);
  const orientation = strings(eeoIn.sexual_orientation)
    .map((s) => choice<string>(s, OPTIONS.orientation))
    .filter(Boolean);
  return {
    personal: mergeFlat(base.personal, d.personal),
    education: list(d.education, emptyEducation),
    experience: list(d.experience, emptyExperience),
    skills: strings(d.skills),
    preferences: {
      ...prefs,
      work_mode: choice(prefs.work_mode, OPTIONS.workMode),
      willing_to_relocate: choice(prefs.willing_to_relocate, OPTIONS.yesNo),
    },
    authorization: {
      ...auth,
      countries: strings(authIn.countries),
      citizen_us: choice(auth.citizen_us, OPTIONS.yesNo),
      authorized_us: choice(auth.authorized_us, OPTIONS.yesNo),
      needs_sponsorship: choice(auth.needs_sponsorship, OPTIONS.yesNo),
      authorization_basis: choice(auth.authorization_basis, OPTIONS.basis),
    },
    eeo: {
      gender: choice(eeo.gender, OPTIONS.gender),
      pronouns: choice(eeo.pronouns, OPTIONS.pronouns),
      race: choice(eeo.race, OPTIONS.race),
      hispanic_latino: choice(eeo.hispanic_latino, OPTIONS.yesNoPrivate),
      veteran: choice(eeo.veteran, OPTIONS.yesNoPrivate),
      disability: choice(eeo.disability, OPTIONS.yesNoPrivate),
      lgbtq: choice(eeo.lgbtq, OPTIONS.yesNoPrivate),
      sexual_orientation: Array.from(new Set(orientation)),
    },
    extra: {
      how_heard: str(extra.how_heard),
      notes: str(extra.notes),
      custom: list(extra.custom, () => ({ question: '', answer: '' })),
    },
  };
}

function hasText(item: object): boolean {
  return Object.values(item).some((v) => typeof v === 'string' && v.trim() !== '');
}

/** What gets stored: blank cards dropped, text trimmed at the ends. */
export function cleanProfile(p: Profile): Profile {
  const trimFlat = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as T;
  return {
    ...p,
    personal: trimFlat(p.personal),
    education: p.education.filter(hasText).map(trimFlat),
    experience: p.experience.filter(hasText).map((e) => ({ ...trimFlat(e), description: e.description.replace(/\s+$/, '') })),
    preferences: trimFlat(p.preferences),
    authorization: { ...trimFlat(p.authorization), countries: p.authorization.countries },
    extra: { ...p.extra, how_heard: p.extra.how_heard.trim(), notes: p.extra.notes.trim(), custom: p.extra.custom.filter(hasText).map(trimFlat) },
  };
}

export type PersonalErrors = Partial<Record<'first_name' | 'last_name' | 'email' | 'phone', string>>;

export function validatePersonal(p: Profile['personal']): PersonalErrors {
  const errors: PersonalErrors = {};
  if (!p.first_name.trim()) errors.first_name = 'Required';
  if (!p.last_name.trim()) errors.last_name = 'Required';
  if (!p.email.trim()) errors.email = 'Required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) errors.email = 'Invalid email';
  if (!p.phone.trim()) errors.phone = 'Required';
  else if (p.phone.replace(/\D/g, '').length < 7) errors.phone = 'Too short';
  return errors;
}

export interface SectionState {
  step: number;
  title: string;
  done: boolean;
}

/** The parts that make a profile useful to the agent. Self-identification is optional, so it is not counted. */
export function profileProgress(p: Profile): SectionState[] {
  const a = p.authorization;
  return [
    { step: 0, title: 'Personal', done: Object.keys(validatePersonal(p.personal)).length === 0 },
    { step: 1, title: 'Education', done: p.education.length > 0 },
    { step: 2, title: 'Work experience', done: p.experience.length > 0 },
    { step: 3, title: 'Skills and preferences', done: p.skills.length > 0 },
    // For the US, every form asks both questions; a section with either one unanswered is not done.
    {
      step: 4,
      title: 'Work authorization',
      done: a.countries.length > 0 && (!a.countries.some((c) => /^(united states|usa?|us)$/i.test(c.trim())) || Boolean(a.authorized_us && a.needs_sponsorship)),
    },
  ];
}

/** Experience descriptions are "one point per line"; strip any bullet characters people typed. */
export function bulletLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•●]+\s*/, '').trim())
    .filter(Boolean);
}
