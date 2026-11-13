// The rules the agent reads before it writes anything (table automation_rules; the agent side is
// src/agent_automation/memory/web_rules.py). kind 'cover_letter' is a letter rule, 'section' a rule for one generated
// part of the letter (by slot name), 'answer' one kind of open question on a form, 'always' a standing instruction.

export type RuleKind = 'cover_letter' | 'section' | 'answer' | 'always';

export interface RuleRow {
  id: string;
  kind: RuleKind | string;
  title: string;
  description: string;
  body: string;
  /** What the agent shipped, for Reset. Empty on the person's own rules. */
  default_body: string;
  enabled: boolean;
  builtin: boolean;
  sort: number;
  /** 'web' marks a rule the person changed: the agent never puts the shipped text back over it. */
  updated_by: 'web' | 'agent' | string;
  updated_at: string;
}

/** What the page writes; the hook adds updated_by and updated_at. */
export type RuleWrite = Pick<RuleRow, 'id' | 'kind' | 'title' | 'body' | 'enabled'> & Partial<Pick<RuleRow, 'description' | 'sort' | 'builtin'>>;

/** The kinds of open questions the page offers, with an example rule for each. */
export const ANSWER_KINDS: { title: string; example: string }[] = [
  { title: 'Why this company', example: 'Name one thing the company built that I have used, then tie it to a project of mine.' },
  { title: 'Why this role', example: 'Point to two duties in the posting and the experience that matches each.' },
  { title: 'Tell us about yourself', example: 'Three sentences: what I study, what I build, what I want to learn next.' },
  { title: 'A challenge you solved', example: 'Use the telemetry dashboard story. Situation, what I did, the number it changed.' },
  { title: 'Strengths and weaknesses', example: 'Strength: shipping end to end. Weakness: saying no to scope, and how I work on it.' },
  { title: 'Salary expectations', example: 'Say I am flexible and focused on the learning, unless the form needs a number.' },
  { title: 'Anything else to add', example: 'Leave it empty unless the posting asks for a link to a portfolio.' },
];

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'rule'
  );
}

const shortRandom = () => Math.random().toString(36).slice(2, 6);

export const letterRuleId = (title: string) => `cover-letter/mine-${slug(title)}-${shortRandom()}`;
export const sectionRuleId = (slot: string) => `section/${slot}`;
export const answerRuleId = (title: string) => `answer/${slug(title)}`;
export const alwaysRuleId = (title: string) => `always/${slug(title)}-${shortRandom()}`;
export const ALWAYS_BUILTIN = 'always/builtin';

/** A slot name as words: "why_you" to "Why you". */
export function slotTitle(slot: string): string {
  const words = slot.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slot;
}

/** The first few words of a standing rule, for its title. */
export function headline(body: string): string {
  const words = body.trim().split(/\s+/).slice(0, 7).join(' ');
  return words.length < body.trim().length ? `${words.replace(/[.,;:]$/, '')}...` : words;
}

export const bySort = (a: RuleRow, b: RuleRow) => a.sort - b.sort || a.title.localeCompare(b.title);
