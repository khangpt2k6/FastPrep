// Cover letter templates, as the Python agent reads them (src/agent_automation/agent/cover_letter):
// {{field}} is filled from the profile or the job, {{slot: what to write}} is written by the model for each job.

export interface CoverTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
  builtin: boolean;
  updated_at: string;
}

export interface CoverSettings {
  user_id: string;
  enabled: boolean;
  template_id: string;
  updated_at: string;
}

export interface CoverLetterRow {
  job_id: string;
  template_id: string;
  body: string;
  pdf_path: string;
  problems: string;
  updated_by: 'agent' | 'web' | string;
  updated_at: string;
}

export const DEFAULT_TEMPLATE = 'classic';

/** The fields a template can name. Keep in step with FIELDS in the agent. */
export const FIELDS: Record<string, string> = {
  full_name: 'Your full name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  location: 'City, state',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
  today: "Today's date",
  company: 'Company',
  job_title: 'Job title',
  job_location: 'Job location',
  hiring_manager: 'Hiring Team',
};

// A slot's note never holds {{ or }}: a slot left open must not swallow the text up to the next field.
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::((?:(?!\{\{|\}\})[\s\S])*?))?\}\}/g;

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'field'; name: string; label: string }
  | { kind: 'slot'; name: string; instruction: string };

/** The template split into fixed text, fields and slots, for the preview. */
export function pieces(body: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const match of body.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: body.slice(last, at) });
    const name = match[1].toLowerCase();
    if (name in FIELDS) out.push({ kind: 'field', name, label: FIELDS[name] });
    else out.push({ kind: 'slot', name, instruction: (match[2] ?? '').replace(/\s+/g, ' ').trim() });
    last = at + match[0].length;
  }
  if (last < body.length) out.push({ kind: 'text', text: body.slice(last) });
  return out;
}

/** The parts the model writes, each once. */
export function slotNames(body: string): string[] {
  return [...new Set(pieces(body).flatMap((p) => (p.kind === 'slot' ? [p.name] : [])))];
}

/** What is wrong with a template, in plain words; empty when the agent can use it. */
export function checkTemplate(name: string, body: string): string[] {
  const problems: string[] = [];
  if (!name.trim()) problems.push('Name required.');
  if (!body.trim()) problems.push('Template is empty.');
  const rest = body.replace(PLACEHOLDER, '');
  if (rest.includes('{{') || rest.includes('}}'))
    problems.push('Unmatched {{ }} or invalid name. Use letters and _.');
  if (body.trim() && slotNames(body).length === 0)
    problems.push('Add a generated part, such as {{why_you: two sentences}}.');
  return problems;
}

/** An id for a new template of the person's own; never the same as a bundled one. */
export function newTemplateId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `mine-${slug || 'template'}-${Math.random().toString(36).slice(2, 7)}`;
}

export const STARTER_BODY = `Dear {{hiring_manager}},

{{opening: Two sentences. The role, and the strongest match between the posting and my CV.}}

{{evidence: Three sentences. Two results from my CV that match what the posting asks for.}}

{{closing: One sentence asking for a conversation.}}

Best regards,
{{full_name}}
{{email}} | {{phone}}
`;

// ---- Previews: the letter a template makes, drawn the way the PDF draws it. ----

/** Who the letter is from: the fields the profile fills and the line under the name on the letterhead. */
export interface Sender {
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
  tagline: string;
}

/** The person a preview uses when the profile has no name yet. */
const SAMPLE_SENDER: Sender = {
  full_name: 'Alex Rivera',
  first_name: 'Alex',
  last_name: 'Rivera',
  email: 'alex.rivera@gmail.com',
  phone: '(813) 555-0142',
  location: 'Tampa, FL',
  linkedin: 'linkedin.com/in/alexrivera',
  github: 'github.com/alexrivera',
  website: 'alexrivera.dev',
  tagline: 'Computer Science, University of South Florida',
};

/** The made-up job every sample letter is written for. */
export const SAMPLE_JOB = { company: 'Northwind Labs', job_title: 'Software Engineering Intern', job_location: 'Austin, TX' };

type PersonalLike = Partial<Record<'first_name' | 'last_name' | 'email' | 'phone' | 'city' | 'state' | 'linkedin' | 'github' | 'website', string>>;
type EducationLike = { school?: string; field?: string };

/** The sender from the profile, as the agent reads it; the sample person when the profile has no name. */
export function senderFrom(personal?: PersonalLike | null, education?: EducationLike[] | null): Sender {
  const p = personal ?? {};
  const first = (p.first_name ?? '').trim();
  const last = (p.last_name ?? '').trim();
  const full = `${first} ${last}`.trim();
  if (!full) return SAMPLE_SENDER;
  const school = education?.[0];
  return {
    full_name: full,
    first_name: first,
    last_name: last,
    email: (p.email ?? '').trim(),
    phone: (p.phone ?? '').trim(),
    location: [p.city, p.state].map((s) => (s ?? '').trim()).filter(Boolean).join(', '),
    linkedin: (p.linkedin ?? '').trim(),
    github: (p.github ?? '').trim(),
    website: (p.website ?? '').trim(),
    tagline: [school?.field, school?.school].map((s) => (s ?? '').trim()).filter(Boolean).join(', '),
  };
}

/** A link as the letterhead prints it: no scheme, no www, no slash at the end. */
export function bareLink(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

export type ContactKind = 'location' | 'phone' | 'email' | 'linkedin' | 'github';

/** The letterhead's contact line, in the PDF's order. */
export function contactsOf(sender: Sender): { kind: ContactKind; text: string }[] {
  const kinds: ContactKind[] = ['location', 'phone', 'email', 'linkedin', 'github'];
  return kinds.flatMap((kind) => {
    const value = sender[kind].trim();
    if (!value) return [];
    return [{ kind, text: kind === 'linkedin' || kind === 'github' ? bareLink(value) : value }];
  });
}

/** Every field's value for a sample letter, as fields_for in the agent fills them. */
export function sampleFields(sender: Sender, today = new Date()): Record<string, string> {
  return {
    full_name: sender.full_name,
    first_name: sender.first_name,
    last_name: sender.last_name,
    email: sender.email,
    phone: sender.phone,
    location: sender.location,
    linkedin: sender.linkedin,
    github: sender.github,
    website: sender.website,
    today: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    company: SAMPLE_JOB.company,
    job_title: SAMPLE_JOB.job_title,
    job_location: SAMPLE_JOB.job_location,
    hiring_manager: 'Hiring Team',
  };
}

/** Sample text for the parts the model writes, by part name; {company} and {job_title} are filled in. */
const SAMPLE_SLOTS: Record<string, string> = {
  opening:
    "I am applying for the {job_title} role at {company}. I build backend services in Python and Go, and that is the core of what your posting asks for.",
  evidence:
    "Last summer I rewrote the slowest queries in a campus lab's reporting job, and its run time fell from 40 minutes to 6. I also wrote the test suite for a student ride app and took it to 85% coverage. Both match the posting's focus on fast, reliable services.",
  why_company:
    "Your posting says the team builds tools that thousands of small shops use every day. I want to work where I can see the people my code helps, and {company} is that kind of place.",
  closing: "Thank you for reading. I would be glad to talk about how I could help your team this summer.",
  fit: "I also wrote the tests for a student ride app and took it to 85% coverage, which matches your focus on reliable code. Your team's work on tools for small shops is the kind of work I want to learn from.",
  story:
    "Last spring our campus bus app showed buses that had left ten minutes earlier. I traced the delay to a feed we polled once a minute and moved it to a live stream. Within a week the times were right to the second, and 300 more students started using the app.",
  bridge:
    "Your posting describes the same kind of work: finding where data goes stale and fixing it at the source. At {company} I would bring that habit to your delivery tracking tools.",
  projects:
    "At school I built a bus tracker in TypeScript and Go that 1,200 students now use. In a data structures course I wrote a search index in Python that answers queries in under 50 ms. Both used tools your posting names, and both taught me to measure before I change anything.",
  learning:
    "I learned Docker in a week to ship the bus tracker, then used it to cut our team's setup time from a day to an hour. Your mentoring program is where I want to keep growing.",
  achievements:
    "- I cut a lab's reporting job from 40 minutes to 6 by rewriting its slowest SQL, the performance work your posting asks for.\n- I wrote the test suite for a student ride app and took it to 85% coverage, the reliable code your team values.\n- I built a bus tracker in TypeScript and Go that 1,200 students use, so I can ship a full stack feature end to end.",
};

/** Longer or different samples where a template asks for something the shared ones do not fit. */
const SAMPLE_BY_TEMPLATE: Record<string, Record<string, string>> = {
  impact: {
    opening: "I am applying for the {job_title} role at {company}. I would bring fast, well tested backend work from my first week.",
    why_company: "Your posting says the team owns its services from design to on call. That is how I like to work, and I want to learn it from people who do it every day.",
  },
  concise: {
    opening: "I am applying for the {job_title} role at {company}. Last summer I cut a lab's reporting job from 40 minutes to 6, the kind of performance work your posting describes.",
  },
  'new-grad': {
    opening: "I am applying for the {job_title} role at {company}. I study computer science, and the tools in your posting are the ones I use every week.",
  },
  'full-page': {
    opening:
      "I am writing to apply for the {job_title} role at {company}. I study computer science, and I used your tools at the small shop where I worked through high school.",
    why_company:
      "{company} started as a way for one bakery to track its orders, and it now serves thousands of small shops. Your mission is to give owners back the hours they lose to paperwork. I saw what that means behind a counter: an owner closing the register at nine, then counting stock by hand until midnight. That work matters to me. I would be proud to build a feature that sends that owner home on time.",
    story:
      "Last summer a campus research lab asked me to speed up a reporting job that took 40 minutes and often failed overnight. They thought the server was too small. When I timed each step, the real problem was three queries that read the same table again for every row. My first fix added an index, and it barely helped. So I rewrote the queries to read the table once and join in memory, and I added tests for the numbers the lab cared about. The job dropped to 6 minutes and has not failed since. I learned to measure before I change anything, and to ask what a slow system is really doing before I trust the first guess about it.",
    second_story:
      "That habit of asking first helped me again as a teaching assistant for an intro programming course. Students kept failing the same lab, and the easy answer was that it was too hard. I sat with a few of them and found the instructions skipped one setup step. I rewrote that page and added a short checklist, and the lab's pass rate rose from 58% to 91%. Since then I start by asking what the user actually sees, which is the question your team asks about every shop owner.",
    shared_belief:
      "Your product guide says every feature should save an owner time on their first day with it. I believe the same thing about my own work. I ship small changes, watch how people use them, and fix what slows them down. That is how I built the lab's tests, and it is how I would work on your team.",
    closing:
      "I would bring careful, measured engineering and a real care for the people who run small shops. Thank you for your time, and I would welcome a conversation about the role.",
  },
};

/** The template a duplicate came from: "mine-full-page-ab12c" was made from "full-page". */
function baseTemplateId(id: string): string {
  return id.replace(/^mine-/, '').replace(/-[a-z0-9]{5}$/, '');
}

/** Sample text for one generated part; the template's note in brackets when there is no sample for it. */
export function sampleSlot(templateId: string, name: string, instruction: string): string {
  const text = SAMPLE_BY_TEMPLATE[templateId]?.[name] ?? SAMPLE_BY_TEMPLATE[baseTemplateId(templateId)]?.[name] ?? SAMPLE_SLOTS[name];
  if (!text) return `[${instruction || 'Written for each job'}]`;
  return text.replace(/\{company\}/g, SAMPLE_JOB.company).replace(/\{job_title\}/g, SAMPLE_JOB.job_title);
}

/** Wrap each generated part in a filled sample, so the preview can mark it. */
export const GEN_START = '\u0002';
export const GEN_END = '\u0003';
const FIELD_MARK = '\u0001';
const SEPARATORS = ' |·•,/';

function stripChars(text: string, chars: string): string {
  let a = 0;
  let b = text.length;
  while (a < b && chars.includes(text[a])) a++;
  while (b > a && chars.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

/** A line after its fields were filled: separators left by empty fields go, and a line that was only fields goes (null). */
function tidyLine(line: string): string | null {
  const kept = line
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter((part) => stripChars(part, SEPARATORS));
  const tidy = kept.join(' | ').trim();
  return stripChars(tidy, SEPARATORS + ':') ? tidy : null;
}

/** The template filled the way the agent fills it, with each generated part between GEN_START and GEN_END. */
export function fillSample(templateId: string, body: string, fields: Record<string, string>): string {
  const filled = body.replace(PLACEHOLDER, (_all: string, rawName: string, note?: string) => {
    const name = rawName.toLowerCase();
    if (name in FIELDS) return `${FIELD_MARK}${(fields[name] ?? '').trim()}${FIELD_MARK}`;
    return `${GEN_START}${sampleSlot(templateId, name, (note ?? '').replace(/\s+/g, ' ').trim())}${GEN_END}`;
  });
  const lines: string[] = [];
  for (const line of filled.split(/\r?\n/)) {
    const plain = line.split(FIELD_MARK).join('');
    const kept = line.includes(FIELD_MARK) ? tidyLine(plain) : plain;
    if (kept !== null) lines.push(kept.trimEnd());
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** The letter's paragraphs. Under a letterhead, a first block that only repeats the name and contact line goes, as in the PDF. */
export function letterParagraphs(text: string, name: string): string[] {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!name || paragraphs.length === 0) return paragraphs;
  const first = paragraphs[0].split(GEN_START).join('').split(GEN_END).join('').split('\n');
  if (first[0].trim().toLowerCase() === name.toLowerCase() && first.length <= 3 && !first.some((l) => l.trim().endsWith('.')))
    return paragraphs.slice(1);
  return paragraphs;
}

/** The subject line of a letter, set in bold: "Re: Software Engineer Intern". */
export function isSubjectLine(line: string): boolean {
  return /^(?:re|subject|regarding):\s/i.test(line.trim());
}
