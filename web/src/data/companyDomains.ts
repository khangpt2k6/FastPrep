// A hand-kept map from an employer's name to its own web domain, for its logo. The agent names most companies itself, but
// the inbox and the calendar only know a name, and some postings give no site at all: this fills those in without asking a
// model. Only domains we are sure of: a wrong one shows another company's logo, a missing one only a letter.
// Keys are names as `nameKey` writes them: lower case, letters and digits only, legal suffixes dropped.

const DOMAINS: Record<string, string> = {
  // Big tech and software.
  google: 'google.com', alphabet: 'abc.xyz', youtube: 'youtube.com', deepmind: 'deepmind.google', microsoft: 'microsoft.com',
  linkedin: 'linkedin.com', github: 'github.com', apple: 'apple.com', amazon: 'amazon.com', amazonwebservices: 'aws.amazon.com',
  aws: 'aws.amazon.com', meta: 'meta.com', facebook: 'facebook.com', instagram: 'instagram.com', whatsapp: 'whatsapp.com',
  netflix: 'netflix.com', nvidia: 'nvidia.com', intel: 'intel.com', amd: 'amd.com', qualcomm: 'qualcomm.com', ibm: 'ibm.com',
  oracle: 'oracle.com', salesforce: 'salesforce.com', slack: 'slack.com', tableau: 'tableau.com', adobe: 'adobe.com',
  intuit: 'intuit.com', cisco: 'cisco.com', vmware: 'vmware.com', broadcom: 'broadcom.com', dell: 'dell.com',
  delltechnologies: 'dell.com', hp: 'hp.com', hpe: 'hpe.com', hewlettpackardenterprise: 'hpe.com', samsung: 'samsung.com',
  sony: 'sony.com', tesla: 'tesla.com', spacex: 'spacex.com', uber: 'uber.com', lyft: 'lyft.com', airbnb: 'airbnb.com',
  doordash: 'doordash.com', instacart: 'instacart.com', snap: 'snap.com', snapchat: 'snap.com', pinterest: 'pinterest.com',
  reddit: 'reddit.com', x: 'x.com', twitter: 'x.com', spotify: 'spotify.com', shopify: 'shopify.com', atlassian: 'atlassian.com',
  dropbox: 'dropbox.com', box: 'box.com', zoom: 'zoom.us', zoomvideocommunications: 'zoom.us', servicenow: 'servicenow.com',
  workday: 'workday.com', snowflake: 'snowflake.com', databricks: 'databricks.com', datadog: 'datadoghq.com',
  cloudflare: 'cloudflare.com', mongodb: 'mongodb.com', twilio: 'twilio.com', okta: 'okta.com', palantir: 'palantir.com',
  palantirtechnologies: 'palantir.com', crowdstrike: 'crowdstrike.com', paloaltonetworks: 'paloaltonetworks.com',
  fortinet: 'fortinet.com', zscaler: 'zscaler.com', splunk: 'splunk.com', elastic: 'elastic.co', confluent: 'confluent.io',
  hashicorp: 'hashicorp.com', gitlab: 'gitlab.com', figma: 'figma.com', canva: 'canva.com', notion: 'notion.so',
  asana: 'asana.com', airtable: 'airtable.com', hubspot: 'hubspot.com', zendesk: 'zendesk.com', docusign: 'docusign.com',
  autodesk: 'autodesk.com', unity: 'unity.com', roblox: 'roblox.com', epicgames: 'epicgames.com', electronicarts: 'ea.com',
  ea: 'ea.com', activisionblizzard: 'activisionblizzard.com', riotgames: 'riotgames.com', nintendo: 'nintendo.com',
  openai: 'openai.com', anthropic: 'anthropic.com', scaleai: 'scale.com', scale: 'scale.com', huggingface: 'huggingface.co',
  cohere: 'cohere.com', perplexity: 'perplexity.ai', elevenlabs: 'elevenlabs.io', mistralai: 'mistral.ai', xai: 'x.ai',
  stripe: 'stripe.com', plaid: 'plaid.com', square: 'squareup.com', block: 'block.xyz', paypal: 'paypal.com', venmo: 'venmo.com',
  coinbase: 'coinbase.com', robinhood: 'robinhood.com', ramp: 'ramp.com', brex: 'brex.com', chime: 'chime.com', sofi: 'sofi.com',
  affirm: 'affirm.com', gusto: 'gusto.com', rippling: 'rippling.com', deel: 'deel.com', verkada: 'verkada.com',
  samsara: 'samsara.com', anduril: 'anduril.com', scopely: 'scopely.com', duolingo: 'duolingo.com', grammarly: 'grammarly.com',
  yelp: 'yelp.com', ebay: 'ebay.com', etsy: 'etsy.com', wayfair: 'wayfair.com', chewy: 'chewy.com', zillow: 'zillow.com',
  expedia: 'expedia.com', booking: 'booking.com', bookingholdings: 'bookingholdings.com', tripadvisor: 'tripadvisor.com',
  wex: 'wexinc.com', fiserv: 'fiserv.com', fis: 'fisglobal.com', jackhenry: 'jackhenry.com', ncr: 'ncr.com', sap: 'sap.com',
  siemens: 'siemens.com', bosch: 'bosch.com', texasinstruments: 'ti.com', micron: 'micron.com', appliedmaterials: 'appliedmaterials.com',
  lamresearch: 'lamresearch.com', kla: 'kla.com', arm: 'arm.com', marvell: 'marvell.com', analogdevices: 'analog.com',
  hackerrank: 'hackerrank.com', grafana: 'grafana.com', grafanalabs: 'grafana.com', vercel: 'vercel.com', supabase: 'supabase.com',
  // Finance and trading.
  morganstanley: 'morganstanley.com', goldmansachs: 'goldmansachs.com', jpmorgan: 'jpmorganchase.com',
  jpmorganchase: 'jpmorganchase.com', chase: 'chase.com', bankofamerica: 'bankofamerica.com', citi: 'citi.com',
  citigroup: 'citi.com', citibank: 'citi.com', wellsfargo: 'wellsfargo.com', capitalone: 'capitalone.com',
  americanexpress: 'americanexpress.com', amex: 'americanexpress.com', visa: 'visa.com', mastercard: 'mastercard.com',
  discover: 'discover.com', blackrock: 'blackrock.com', vanguard: 'vanguard.com', fidelity: 'fidelity.com',
  fidelityinvestments: 'fidelity.com', charlesschwab: 'schwab.com', schwab: 'schwab.com', statestreet: 'statestreet.com',
  bnymellon: 'bny.com', bny: 'bny.com', usbank: 'usbank.com', pnc: 'pnc.com', truist: 'truist.com', ally: 'ally.com',
  barclays: 'barclays.com', deutschebank: 'db.com', ubs: 'ubs.com', hsbc: 'hsbc.com', nomura: 'nomura.com',
  raymondjames: 'raymondjames.com', janestreet: 'janestreet.com', citadel: 'citadel.com', citadelsecurities: 'citadelsecurities.com',
  twosigma: 'twosigma.com', hudsonrivertrading: 'hudsonrivertrading.com', optiver: 'optiver.com', imc: 'imc.com',
  imctrading: 'imc.com', susquehanna: 'sig.com', sig: 'sig.com', drw: 'drw.com', jumptrading: 'jumptrading.com',
  deshaw: 'deshaw.com', bridgewater: 'bridgewater.com', bridgewaterassociates: 'bridgewater.com', aqr: 'aqr.com',
  millennium: 'mlp.com', point72: 'point72.com', virtu: 'virtu.com', tradeweb: 'tradeweb.com', nasdaq: 'nasdaq.com',
  cme: 'cmegroup.com', cmegroup: 'cmegroup.com', ice: 'ice.com', bloomberg: 'bloomberg.com', moodys: 'moodys.com',
  spglobal: 'spglobal.com', msci: 'msci.com', dtcc: 'dtcc.com', geico: 'geico.com', statefarm: 'statefarm.com',
  progressive: 'progressive.com', allstate: 'allstate.com', usaa: 'usaa.com', libertymutual: 'libertymutual.com',
  // Consulting and services.
  deloitte: 'deloitte.com', pwc: 'pwc.com', ey: 'ey.com', ernstyoung: 'ey.com', kpmg: 'kpmg.com', accenture: 'accenture.com',
  mckinsey: 'mckinsey.com', mckinseycompany: 'mckinsey.com', bcg: 'bcg.com', bostonconsultinggroup: 'bcg.com', bain: 'bain.com',
  baincompany: 'bain.com', boozallen: 'boozallen.com', boozallenhamilton: 'boozallen.com', capgemini: 'capgemini.com',
  infosys: 'infosys.com', tcs: 'tcs.com', tataconsultancyservices: 'tcs.com', wipro: 'wipro.com', cognizant: 'cognizant.com',
  epam: 'epam.com', thoughtworks: 'thoughtworks.com', slalom: 'slalom.com', gartner: 'gartner.com',
  // Defense, aerospace, industry.
  lockheedmartin: 'lockheedmartin.com', raytheon: 'rtx.com', rtx: 'rtx.com', northropgrumman: 'northropgrumman.com',
  boeing: 'boeing.com', generaldynamics: 'gd.com', l3harris: 'l3harris.com', baesystems: 'baesystems.com', leidos: 'leidos.com',
  saic: 'saic.com', caci: 'caci.com', mitre: 'mitre.org', honeywell: 'honeywell.com', generalelectric: 'ge.com', ge: 'ge.com',
  geaerospace: 'geaerospace.com', gevernova: 'gevernova.com', caterpillar: 'caterpillar.com', johndeere: 'deere.com',
  deere: 'deere.com', '3m': '3m.com', ford: 'ford.com', generalmotors: 'gm.com', gm: 'gm.com', toyota: 'toyota.com',
  rivian: 'rivian.com', aurora: 'aurora.tech', waymo: 'waymo.com', cruise: 'getcruise.com', zoox: 'zoox.com', nasa: 'nasa.gov',
  jpl: 'jpl.nasa.gov', blueorigin: 'blueorigin.com', exxonmobil: 'exxonmobil.com', chevron: 'chevron.com', shell: 'shell.com',
  nexteraenergy: 'nexteraenergy.com', duke: 'duke-energy.com', dukeenergy: 'duke-energy.com',
  // Retail, consumer, media.
  walmart: 'walmart.com', target: 'target.com', costco: 'costco.com', homedepot: 'homedepot.com', thehomedepot: 'homedepot.com',
  lowes: 'lowes.com', bestbuy: 'bestbuy.com', nike: 'nike.com', starbucks: 'starbucks.com', mcdonalds: 'mcdonalds.com',
  cocacola: 'coca-colacompany.com', pepsico: 'pepsico.com', procter: 'pg.com', proctergamble: 'pg.com', pg: 'pg.com',
  unilever: 'unilever.com', disney: 'disney.com', waltdisney: 'disney.com', thewaltdisneycompany: 'disney.com',
  warnerbrosdiscovery: 'wbd.com', comcast: 'comcast.com', nbcuniversal: 'nbcuniversal.com', verizon: 'verizon.com',
  att: 'att.com', tmobile: 't-mobile.com', publix: 'publix.com', kroger: 'kroger.com', marriott: 'marriott.com',
  hilton: 'hilton.com', delta: 'delta.com', deltaairlines: 'delta.com', unitedairlines: 'united.com', americanairlines: 'aa.com',
  southwest: 'southwest.com', southwestairlines: 'southwest.com', jetblue: 'jetblue.com', fedex: 'fedex.com', ups: 'ups.com',
  // Health.
  moffittcancercenter: 'moffitt.org', moffitt: 'moffitt.org', unitedhealthgroup: 'unitedhealthgroup.com', optum: 'optum.com',
  cvshealth: 'cvshealth.com', cvs: 'cvs.com', walgreens: 'walgreens.com', humana: 'humana.com', cigna: 'thecignagroup.com',
  elevancehealth: 'elevancehealth.com', kaiserpermanente: 'kaiserpermanente.org', mayoclinic: 'mayoclinic.org',
  johnsonjohnson: 'jnj.com', jnj: 'jnj.com', pfizer: 'pfizer.com', merck: 'merck.com', abbvie: 'abbvie.com', amgen: 'amgen.com',
  medtronic: 'medtronic.com', stryker: 'stryker.com', abbott: 'abbott.com', gehealthcare: 'gehealthcare.com', epic: 'epic.com',
  epicsystems: 'epic.com', cerner: 'oracle.com', intuitive: 'intuitive.com', intuitivesurgical: 'intuitive.com',
  cincinnatichildrens: 'cincinnatichildrens.org', cincinnatichildrenshospitalmedicalcenter: 'cincinnatichildrens.org',
  // Florida and Tampa Bay employers.
  jabil: 'jabil.com', tecoenergy: 'tecoenergy.com', teco: 'tecoenergy.com', tampageneralhospital: 'tgh.org',
  baycare: 'baycare.org', baycarehealthsystem: 'baycare.org', adventhealth: 'adventhealth.com', usf: 'usf.edu',
  universityofsouthflorida: 'usf.edu', kforce: 'kforce.com', carmax: 'carmax.com',
  // People the person has applied to.
  prox: 'joinprox.com', fedcon: 'fedcon.com',
};

/** A company's name as the map keys it: lower case, only letters and digits, a leading "the" and legal suffixes dropped. */
export function nameKey(name: string): string {
  let words = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9\s]+/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words = words.slice(1);
  const suffixes = new Set(['inc', 'llc', 'ltd', 'corp', 'corporation', 'co', 'company', 'plc', 'lp', 'llp', 'sa', 'ag', 'gmbh', 'holdings']);
  while (words.length > 1 && suffixes.has(words[words.length - 1])) words = words.slice(0, -1);
  return words.join('');
}

/** The domain we keep for a company of this name, or '' when we do not know it. */
export function domainForName(name: string | null | undefined): string {
  if (!name) return '';
  return DOMAINS[nameKey(name)] ?? '';
}
