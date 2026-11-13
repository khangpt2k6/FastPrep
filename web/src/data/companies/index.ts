import research from './research.json'

/**
 * What SWE intern and new-grad postings ask for, per company, next to what the
 * company runs. Researched from the official postings and engineering blogs, and
 * (evidence B or C) counted from the intern postings in the agent's job database;
 * `research.json` is the record, including the postings each entry came from.
 */

export const CATEGORIES = ['Big Tech', 'AI', 'Quant', 'Fintech', 'Finance', 'Data & Infra', 'Enterprise', 'Consumer', 'Health', 'Hardware & Defense'] as const
export type CompanyCategory = (typeof CATEGORIES)[number]

export interface Posting {
  found: boolean
  cycle?: string
  required?: string[]
  preferred?: string[]
  url?: string
}

export interface Company {
  name: string
  slug: string
  domain: string
  category: CompanyCategory
  logo: string | null
  need: string[]
  stack: string[]
  niche: string[]
  summary: string
  evidence: 'A' | 'B' | 'C'
  intern: Posting
  newGrad: Posting
  sources: string[]
}

interface Row {
  company: string
  domain: string
  /** Set on entries added from the job database; older entries take theirs from CATEGORY. */
  category?: CompanyCategory
  intern: Posting
  new_grad: Posting
  need: string[]
  core_stack: string[]
  niche: string[]
  summary: string
  evidence: string
  sources: string[]
}

const CATEGORY: Record<string, CompanyCategory> = {
  Amazon: 'Big Tech', Google: 'Big Tech', Microsoft: 'Big Tech', Meta: 'Big Tech', Apple: 'Big Tech', Netflix: 'Big Tech',
  Nvidia: 'Big Tech', Adobe: 'Big Tech', Salesforce: 'Big Tech', LinkedIn: 'Big Tech', Intuit: 'Big Tech',
  OpenAI: 'AI', Anthropic: 'AI', 'Scale AI': 'AI',
  'Jane Street': 'Quant', 'Citadel / Citadel Securities': 'Quant', 'Two Sigma': 'Quant', 'Hudson River Trading': 'Quant',
  Optiver: 'Quant', 'IMC Trading': 'Quant',
  Stripe: 'Fintech', Coinbase: 'Fintech', Robinhood: 'Fintech', Ramp: 'Fintech', Gusto: 'Fintech', Rippling: 'Fintech',
  BlackRock: 'Fintech',
  Cloudflare: 'Data & Infra', Datadog: 'Data & Infra', Snowflake: 'Data & Infra', Confluent: 'Data & Infra',
  MongoDB: 'Data & Infra', Databricks: 'Data & Infra', Palantir: 'Data & Infra',
  Uber: 'Consumer', DoorDash: 'Consumer', Airbnb: 'Consumer', Roblox: 'Consumer', Figma: 'Consumer',
  Tesla: 'Hardware & Defense', SpaceX: 'Hardware & Defense', Anduril: 'Hardware & Defense',
}

const LOGO: Record<string, string> = {
  Amazon: 'amazon.svg', Nvidia: 'nvidia.svg', Cloudflare: 'cloudflare.svg', Gusto: 'gusto.svg', Adobe: 'adobe.svg',
  Salesforce: 'salesforce.svg', Coinbase: 'coinbase.svg', Datadog: 'datadog.svg', Tesla: 'tesla.svg', Roblox: 'roblox.svg',
  Ramp: 'ramp.svg', Rippling: 'rippling.svg', Robinhood: 'robinhood.svg', Snowflake: 'snowflake.svg',
  Confluent: 'confluent.svg', MongoDB: 'mongodb.svg', DoorDash: 'doordash.svg', Uber: 'uber.svg', Intuit: 'intuit.svg',
  Google: 'google.svg', Microsoft: 'microsoft.svg', Meta: 'meta.svg', Apple: 'apple.svg', Netflix: 'netflix.svg',
  Databricks: 'databricks.svg', Stripe: 'stripe.svg', Palantir: 'palantir.svg', LinkedIn: 'linkedin.svg', Figma: 'figma.svg',
  Airbnb: 'airbnb.svg', BlackRock: 'blackrock.svg', SpaceX: 'spacex.svg', Anduril: 'anduril.svg', Notion: 'notion.svg',
  'Jane Street': 'janestreet.svg', 'Citadel / Citadel Securities': 'citadel.svg', 'Two Sigma': 'twosigma.svg',
  'Hudson River Trading': 'hudsonrivertrading.svg', Optiver: 'optiver.svg', 'IMC Trading': 'imc.png',
  'Scale AI': 'scaleai.svg', OpenAI: 'openai.svg', Anthropic: 'anthropic.svg',
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const companies: Company[] = (research as Row[])
  .map((row) => ({
    name: row.company,
    slug: slugOf(row.company),
    domain: row.domain,
    category: row.category ?? CATEGORY[row.company] ?? 'Big Tech',
    logo: LOGO[row.company]
      ? `/logos/company/${LOGO[row.company]}`
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(row.domain)}&sz=128`,
    need: row.need,
    stack: row.core_stack.filter((tech) => !row.need.includes(tech)),
    niche: row.niche,
    summary: row.summary,
    evidence: (row.evidence as Company['evidence']) ?? 'B',
    intern: row.intern,
    newGrad: row.new_grad,
    sources: row.sources,
  }))
  .sort(
    (a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name),
  )
