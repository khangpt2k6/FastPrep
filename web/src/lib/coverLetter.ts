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
