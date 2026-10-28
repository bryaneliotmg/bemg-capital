// Deterministic grant matching — no LLM at match time. Every reason string below
// cites a structured fact that was actually checked, so "why you matched" stays
// a truthful readout rather than a generated-sounding claim.

export interface RawFundingOpportunity {
  id: string;
  /** Where this row came from — 'grants_gov' for the original federal source, or a
   * non-federal source added later (e.g. 'hello_alice'). Only Grants.gov rows carry
   * its numeric applicant-type facet codes, so eligibility is checked differently
   * per source — see hasBusinessEligibility() below. */
  source: string;
  opportunity_number: string | null;
  title: string;
  agency_name: string | null;
  agency_code: string | null;
  cfda_list: string[] | null;
  doc_type: string | null;
  status: string | null;
  open_date: string | null;
  close_date: string | null;
  award_floor: number | null;
  award_ceiling: number | null;
  eligibility_codes: string[] | null;
  description: string | null;
  announcement_url: string | null;
  applicant_eligibility_desc: string | null;
  funding_categories: FundingCategory[] | null;
  agency_contact_name: string | null;
  agency_contact_email: string | null;
  agency_contact_phone: string | null;
  /** One-time AI-classified subject domain (see api/_lib/domainTaxonomy.ts), computed
   * once when the grant is synced/imported — never computed live here. Null until
   * classification has run (e.g. right after a fresh sync, before the background
   * classification pass completes). */
  primary_domain: string | null;
  /** State/territory codes this grant is restricted to (e.g. ["WA"]), extracted in the
   * same one-time AI pass as primary_domain — null before classification has run, []
   * once classified with no restriction found (nationwide/open). */
  eligible_states: string[] | null;
}

export interface FundingCategory {
  id: string;
  description: string;
}

// Grants.gov's fixed applicant-type facet — the full enum, not just the
// business-relevant subset, so the detail panel can show every eligible
// applicant type for a grant, not just the ones that matched bEMG.
export const ELIGIBILITY_LABELS: Record<string, string> = {
  '00': 'State governments',
  '01': 'County governments',
  '02': 'City or township governments',
  '04': 'Special district governments',
  '05': 'Independent school districts',
  '06': 'Public and State controlled institutions of higher education',
  '07': 'Native American tribal governments (Federally recognized)',
  '08': 'Public housing authorities/Indian housing authorities',
  '11': 'Native American tribal organizations (other than Federally recognized)',
  '12': 'Nonprofits with a 501(c)(3) status, other than institutions of higher education',
  '13': 'Nonprofits without a 501(c)(3) status, other than institutions of higher education',
  '20': 'Private institutions of higher education',
  '21': 'Individuals',
  '22': 'For-profit organizations other than small businesses',
  '23': 'Small businesses',
  '25': 'Others (see additional eligibility information)',
  '99': 'Unrestricted — open to any type of entity',
};

export interface BusinessProfile {
  /** Lowercase keywords describing the business's industry/services, used for title/description overlap. */
  keywords: string[];
  /** Stated capital requirement range, if known (from Growth DNA). */
  capitalRequirementMin?: number;
  /** The tenant's own one-time AI-classified business domain (see
   * tenant_domain_classification / api/_lib/domainTaxonomy.ts) — a coarse consistency
   * check against a grant's classified domain, not a live judgment call. Undefined
   * until the tenant has been classified (e.g. right after their first Business DNA
   * save, before the background classification call completes). */
  domain?: string;
  /** The tenant's own USPS state code, parsed directly from their Business DNA
   * "Headquarters City" field (see src/lib/location.ts) — not AI-inferred, since a
   * tenant's own stated address is a fact, not something worth guessing at. */
  state?: string;
  /** Who owns the business, from Business DNA's "Majority Owner Identity" and
   * "Certifications" fields (see src/lib/ownerIdentity.ts) — chosen from a fixed list
   * by the owner, so like `state` this is a stated fact, not an inference. Undefined
   * when neither field has been answered. */
  owner?: OwnerIdentity;
  /** From Business DNA's "Ownership Structure" (see parseOrganizationType in
   * src/lib/ownerIdentity.ts). Undefined when it hasn't been filled in or doesn't say. */
  organizationType?: 'for_profit' | 'nonprofit';
  /** The tenant's own "Industry" and "Products & Services" text, for checking grants
   * limited to one industry (beauty brands, restaurants, ...). Undefined when blank. */
  industryText?: string;
}

export type OwnerGroup =
  | 'black'
  | 'hispanic'
  | 'asian'
  | 'native'
  | 'pacific'
  | 'minority'
  | 'women'
  | 'veteran'
  | 'disabled_veteran'
  | 'lgbtq'
  | 'disability';

export interface OwnerIdentity {
  groups: OwnerGroup[];
  /** False when only Certifications was answered — enough to prove a group, not to rule one out. */
  identityAnswered: boolean;
}

// Duplicated from api/_lib/domainTaxonomy.ts's WILDCARD_DOMAIN rather than imported —
// that module uses @google/genai and server-only env vars and has no business being
// pulled into this client-side bundle just for one string constant. Must stay in sync.
const WILDCARD_DOMAIN = 'Other / General Business Support';

export interface MatchResult {
  eligible: boolean;
  matchPct: number;
  reasons: string[];
  /** Structural concerns distinct from "why you matched" — things that could make this
   * opportunity not actually viable despite clearing the eligibility/keyword checks above. */
  caveats: string[];
}

// Grants.gov applicant-type facet codes plausible for a for-profit small business —
// plus the two nonprofit codes (12, 13), since bEMG Capital serves nonprofit tenants
// too (e.g. arts/wellness organizations), not just for-profit small businesses.
const BUSINESS_ELIGIBLE_CODES = new Set(['12', '13', '22', '23', '25', '99']);
// Once a tenant's Ownership Structure says which kind of organization it is, only that
// kind's codes count. Real case: bEMG (a sole proprietorship) had "FY 2021-2023 EDA
// Planning" grants for cities and nonprofits as its #3-#8 matches, because the shared
// set above let nonprofit codes 12/13 stand in for "a business can apply".
const FOR_PROFIT_CODES = new Set(['22', '23', '25', '99']);
const NONPROFIT_CODES = new Set(['12', '13', '25', '99']);

function eligibleCodesFor(organizationType: BusinessProfile['organizationType']): Set<string> {
  if (organizationType === 'for_profit') return FOR_PROFIT_CODES;
  if (organizationType === 'nonprofit') return NONPROFIT_CODES;
  return BUSINESS_ELIGIBLE_CODES;
}
const OPEN_STATUSES = new Set(['posted', 'forecasted']);

// Bare eligibility alone (clearing the hard filter, best-case eligibility-type bonus,
// best-case status bonus) now tops out around 33 (20 + 8 + 5) — down from 65 (40+15+10).
// Real cases showed 65 was far too generous: a USDA plant-disease grant and an NSF
// astrophysics grant both crossed this 70% "strong match" threshold off a SINGLE
// coincidental keyword hit (worth +10 under the old weights), because bare eligibility
// alone already sat within one keyword-match of 70. Base/eligibility/status bonuses
// were all roughly halved and the per-keyword weight raised (10→15, cap 30→45) so real
// topical evidence — not just showing up eligible — has to do the actual work of
// reaching "strong match": from the new ~33 ceiling, 70 requires roughly 3 genuine
// keyword matches (3 × 15 = 45), i.e. substantive alignment, not one lucky word.
// Kept at a fixed, familiar 70 (already used throughout this app's UI copy).
export const STRONG_MATCH_THRESHOLD = 70;

// The highest score a grant can keep once a check concludes the tenant likely isn't eligible.
const LIKELY_INELIGIBLE_CAP = 20;

// STTR (not SBIR) statutorily requires the small business to have a formal cooperative
// R&D partnership with a U.S. nonprofit research institution — a named co-PI there, a
// subcontract, a defined division of labor performing at least 30% of the work. This is
// real, stable domain knowledge (same basis as the NIH review-criteria detection
// elsewhere in this app), not something Grants.gov exposes as a structured field, so
// keyword/eligibility-code matching alone can't catch it — it has to be checked directly.
function isSttr(title: string): boolean {
  return /\bSTTR\b/i.test(title) || /\bR4[12]\b/.test(title);
}

// Real case that surfaced this: SBA's State Trade Expansion Program (STEP) scored 78%
// off a Hello Alice/SBA.gov listing whose own text says the awards go "to state and
// territory governments" — a business can't apply for it, only use whatever services
// its state's trade office later offers. Grants.gov rows already get this right via
// their applicant-type codes (a government-only grant carries only 00-08 and fails
// hasBusinessEligibility), but non-federal rows have no codes and used to clear the
// eligibility filter by source alone. This reads the listing's own words instead:
// "awards/grants/funds ... [are awarded/made/provided] to ... state/local/tribal/
// territory governments". Deliberately requires the money to be directed TO a
// government — a plain list like "small businesses, nonprofits, and local governments"
// doesn't match, so mixed-eligibility programs still show up.
//
// The same SBA.gov sync turned up a second kind of listing nobody new can apply for:
// renewals "exclusively for existing grantees" (SCORE, Boots to Business, VFPETP,
// Portable Assistance) and host-institution solicitations limited to universities
// (the SBDC vacancies). Those are checked here too, since they fail for the same
// reason: the listing itself says who the money goes to, and it isn't the tenant.
// Organization-facing programs that ARE open to new nonprofits (VBOC, WVETP, PRIME)
// don't match any of these and still show up for nonprofit tenants.
const CLOSED_RECIPIENT_PATTERNS: RegExp[] = [
  /\b(?:awards?|grants?|funds|funding|financial assistance)\b(?:\s+[\w-]+){0,6}?\s+to\s+(?:the\s+)?(?:eligible\s+)?(?:state|states|territor(?:y|ies)|tribal|local|county|city|municipal)(?:\s*(?:,|and|or|&)\s*(?:state|states|territor(?:y|ies)|tribal|local|county|city|municipal))*\s+(?:governments?|agencies|entities)\b/i,
  /\b(?:exclusively|only)\b[^.]{0,60}\b(?:existing|current)\b[^.]{0,60}\b(?:grantees?|recipients?)\b/i,
  /\b(?:existing|current)\b[^.]{0,60}\b(?:grantees?|recipients?|recipient organizations)\s+only\b/i,
  /\bmust be a current (?:recipient|grantee)\b/i,
  /\bcurrently funded by (?:the\s+)?SBA\b/i,
  /\beligible (?:entities|applicants) are (?:only |limited to )?(?:institutions of higher education|universities|colleges)\b/i,
];

function isClosedToTenants(opp: RawFundingOpportunity): boolean {
  const text = `${opp.applicant_eligibility_desc ?? ''} ${opp.description ?? ''}`;
  return CLOSED_RECIPIENT_PATTERNS.some((p) => p.test(text));
}

// Real case that surfaced this: "U.S. Embassy Phnom Penh – PAS Annual Program
// Statement" reached a Mississippi small business as a match. Its Grants.gov
// applicant-type code is only 25 ("Others"), which clears the business filter, and the
// AI classified its subject as Small Business & Economic Development off "economic
// growth" and "youth entrepreneurship" — both fair readings of the topic, neither of
// which says the work has to happen in Cambodia. State Department posts abroad fund
// projects in their own country (55 open listings, all agency "U.S. Mission to …"), so
// the agency itself settles it; no AI pass or text reading needed.
function isForeignMission(opp: RawFundingOpportunity): boolean {
  const agency = opp.agency_name ?? '';
  return /^U\.S\. Mission to\b/i.test(agency) || /\b(?:embassy|consulate)\b/i.test(agency);
}

// Grants.gov's "Others" code puts the real eligibility in plain text, and some of it is
// explicit: "For-profit organizations are not eligible to apply" (13 open listings).
// Only a for-profit tenant is ruled out — nonprofits are bEMG Capital tenants too.
// A sentence that only excludes FOREIGN for-profits doesn't count: NSF solicitations
// routinely say "non-U.S. based for-profit organizations are not eligible" right after
// listing U.S. for-profits as eligible (real case: PESOSE).
const FOR_PROFIT_EXCLUDED_PATTERN =
  /\bfor[- ]profit\s+(?:organizations?|entities|entity|businesses|companies|firms|applicants)?\s*(?:are|is)\s+(?:not\s+eligible|ineligible)\b|\bnot\s+eligible\b[^.]{0,40}\bfor[- ]profit\b/gi;
const FOREIGN_ONLY_PATTERN = /\bnon-?U\.?S\b|\bforeign\b|\binternational\b/i;

function excludesForProfits(opp: RawFundingOpportunity): boolean {
  const text = `${opp.applicant_eligibility_desc ?? ''} ${opp.description ?? ''}`
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp;)?nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  for (const match of text.matchAll(FOR_PROFIT_EXCLUDED_PATTERN)) {
    if (!FOREIGN_ONLY_PATTERN.test(text.slice(Math.max(0, match.index - 40), match.index + 20))) return true;
  }
  return false;
}

// The mirror case: corporate small-business grants often say "Nonprofits are not
// eligible" (Verizon Digital Ready), or only ask for "for-profit small businesses"
// (Breva, Freed, Seated Together) — either way a nonprofit tenant can't apply. The
// positive form is only read from the eligibility text, where it states the rule.
const NONPROFIT_EXCLUDED_PATTERN = /\bnon-?profits?(?:\s+organizations?)?\s+(?:are|is)\s+(?:not\s+eligible|ineligible)\b/i;
const FOR_PROFIT_ONLY_PATTERN = /\bfor[- ]profit\s+(?:small\s+)?business(?:es)?\b/i;

function excludesNonprofits(opp: RawFundingOpportunity): boolean {
  return (
    NONPROFIT_EXCLUDED_PATTERN.test(`${opp.applicant_eligibility_desc ?? ''} ${opp.description ?? ''}`) ||
    FOR_PROFIT_ONLY_PATTERN.test(opp.applicant_eligibility_desc ?? '')
  );
}

// Real case: "FY27 Small Business Development Center State of Kansas Network Rebid" was
// bEMG's #1 match at 83% — it carries the small-business code 23, but it funds the
// university or state agency that RUNS a state's SBDC network, not a business that uses
// one. Same for Women's Business Center host solicitations. The SBA.gov copies of these
// are already caught by CLOSED_RECIPIENT_PATTERNS; Grants.gov's are caught by title.
function isSbaResourcePartnerSolicitation(opp: RawFundingOpportunity): boolean {
  return /\bSmall Business Development Centers?\b|\bWomen'?s Business Centers?\b/i.test(opp.title);
}

// Real case: "Atlanta FY 2021 - FY 2023 EDA Planning and Local Technical Assistance"
// still says "posted" with no close date, years after the fiscal years it names. The
// newest year in the title is the best evidence on file of how current a listing is;
// two or more years behind is flagged and pushed down, not hidden, since some
// multi-year notices genuinely stay open.
function latestTitleYear(title: string): number | null {
  const years: number[] = [];
  for (const m of title.matchAll(/\b(20\d{2})\b/g)) years.push(Number(m[1]));
  for (const m of title.matchAll(/\bFY\s?-?(\d{2})\b/gi)) years.push(2000 + Number(m[1]));
  return years.length > 0 ? Math.max(...years) : null;
}

// Programs open to one industry only, read from the title and eligibility text. Real
// case: Sephora's $100K grant for beauty brands scored 76% for bEMG, a marketing
// company — nothing compared the grant's industry limit with the tenant's industry.
// Checked against the tenant's own Industry and Products & Services fields (not its
// Market field, which names customers' industries — bEMG's lists salons and restaurants).
const INDUSTRY_LIMITS: { label: string; grant: RegExp; tenant: RegExp }[] = [
  {
    label: 'beauty brands',
    grant: /\bbeauty\s+(?:brands?|businesses|companies|founders|entrepreneurs|industry)\b/i,
    tenant: /\b(?:beauty|cosmetic|skin\s?care|bath|body care|hair|salon|spa|nail|barber|fragrance)/i,
  },
  {
    label: 'restaurants and food businesses',
    grant: /\brestaurants?\b|\bfood (?:and beverage )?(?:businesses|brands|entrepreneurs)\b/i,
    tenant: /\b(?:restaurant|food|culinary|cafe|café|catering|bakery|beverage|kitchen)/i,
  },
  {
    label: 'manufacturers',
    grant: /\b(?:small\s+)?manufacturers\b|\bmanufacturing (?:businesses|companies|firms)\b/i,
    tenant: /\bmanufactur/i,
  },
  {
    // Wish Local's grant is for "Black-owned brick-and-mortar businesses"; bEMG has no storefront.
    label: 'brick-and-mortar storefronts',
    grant: /\bbrick[- ]and[- ]mortar\b|\bstorefronts?\b/i,
    tenant: /\b(?:store|shop|boutique|storefront|retail|salon|restaurant|barber|cafe|café|studio|clinic|bakery)/i,
  },
  {
    label: 'farms and agricultural producers',
    grant: /\bfarmers\b|\bagricultural producers\b/i,
    tenant: /\b(?:farm|agricultur|ranch|grower)/i,
  },
];

// Real case that surfaced this: H&R Block's "Fund Her Future" grant on Hello Alice lists
// its eligibility as "Women-owned businesses", but scored the same for every tenant —
// nothing compared who a grant is for against who owns the business. Private programs
// (corporate, foundation, Hello Alice) are where most owner-targeted grants live;
// Grants.gov rows are skipped, since federal grants aren't restricted by race or gender
// and their "minority"/"veteran" mentions are almost all boilerplate (632 of ~1,660).
//
// Each pattern needs an ownership word after the group ("-owned", "-led", "founders",
// "entrepreneurs", "business owners", "businesses"), so "Historically Black Colleges"
// or "veterans' families" don't read as a target. A run like "Black and Latina
// women-owned" is captured whole, then split on the conjunctions: each piece is one way
// to qualify, and a piece naming two groups ("Black women") needs both.
const OWNER_GROUP_PREFIXES: Record<OwnerGroup, string> = {
  black: 'black|african[- ]americans?',
  hispanic: 'hispanic|latin[aoxe]s?',
  asian: 'asian(?:[- ]americans?)?|aapi',
  native: 'native[- ]americans?|indigenous|alaska[- ]natives?',
  pacific: 'pacific[- ]islanders?|native[- ]hawaiians?',
  // "women of color" names two groups at once — the women test below matches it too,
  // so a piece like "women of color-owned" needs both (real case: HerRise MicroGrant).
  minority: 'minority|minorities|bipoc|diverse|(?:people|wom[ae]n) of colou?r|underrepresented',
  women: 'wom[ae]n|female|woman',
  veteran: 'veterans?|military',
  disabled_veteran: 'service[- ]disabled[- ]veterans?',
  lgbtq: 'lgbtq?i?a?\\+?|queer',
  disability: 'disabled|disability',
};

const ANY_OWNER_PREFIX = Object.values(OWNER_GROUP_PREFIXES).join('|');
const OWNED_SUFFIX =
  '(?:[- ](?:owned|led|founded)\\b|\\s+(?:small\\s+)?(?:founders?|entrepreneurs?|business(?:es|\\s+owners?)|owners?)\\b)';
const OWNER_TARGET_PATTERN = new RegExp(
  `\\b(?:${ANY_OWNER_PREFIX})(?:(?:\\s*,\\s*|\\s+|\\s*(?:,\\s*)?(?:and|or|&|/)\\s*)(?:${ANY_OWNER_PREFIX}))*${OWNED_SUFFIX}`,
  'gi',
);
const OWNER_GROUP_TESTS = (Object.entries(OWNER_GROUP_PREFIXES) as [OwnerGroup, string][]).map(
  ([group, prefix]) => [group, new RegExp(`\\b(?:${prefix})(?![\\w-]*-disabled)`, 'i')] as const,
);

// Programs that fund organizations SERVING a group (VBOC, WVETP: "for organizations
// providing counseling ... to veteran ... business owners") name the group in their
// eligibility text, but the applicant is the organization, not a business owned by it.
const SERVES_GROUP_PATTERN = /\borganizations?\s+(?:that|which|providing|serving|demonstrating|delivering)\b/i;

/** Each inner array is one way to qualify — every group in it is required. */
type OwnerRequirement = OwnerGroup[];

function findOwnerRequirements(text: string): OwnerRequirement[] {
  const found: OwnerRequirement[] = [];
  for (const match of text.matchAll(OWNER_TARGET_PATTERN)) {
    for (const piece of match[0].split(/\s*(?:,|\band\b|\bor\b|&|\/)\s*/i)) {
      let groups = OWNER_GROUP_TESTS.filter(([, re]) => re.test(piece)).map(([g]) => g);
      // "service-disabled veteran" names one group, not three.
      if (groups.includes('disabled_veteran')) groups = groups.filter((g) => g !== 'veteran' && g !== 'disability');
      if (groups.length > 0 && !found.some((r) => r.join() === groups.join())) found.push(groups);
    }
  }
  return found;
}

const OWNER_GROUP_LABELS: Record<OwnerGroup, string> = {
  black: 'Black',
  hispanic: 'Hispanic/Latino',
  asian: 'Asian American',
  native: 'Native American',
  pacific: 'Pacific Islander',
  minority: 'minority',
  women: 'women',
  veteran: 'veteran',
  disabled_veteran: 'service-disabled veteran',
  lgbtq: 'LGBTQ+',
  disability: 'disability',
};

function describeRequirements(reqs: OwnerRequirement[]): string {
  return `${reqs.map((r) => r.map((g) => OWNER_GROUP_LABELS[g]).join(' ')).join(' or ')}-owned businesses`;
}

function meetsRequirement(req: OwnerRequirement, groups: OwnerGroup[]): boolean {
  return req.every((g) => groups.includes(g));
}

// Local calendar date as YYYY-MM-DD, the same shape close_date is stored in.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Grants.gov agency-code prefixes whose whole portfolio sits in one domain, checked in
// order (more specific first). Only agencies where that's reliably true are listed —
// e.g. DOT and HHS-ACL are left out because their grants span several domains. Names
// must match api/_lib/domainTaxonomy.ts's DOMAINS exactly.
const AGENCY_DOMAINS: [prefix: string, domain: string][] = [
  ['HHS-NIH', 'Science & Technology R&D'],
  ['HHS-FDA', 'Science & Technology R&D'],
  ['NSF', 'Science & Technology R&D'],
  ['NASA', 'Science & Technology R&D'],
  ['DOD-AFRL', 'Science & Technology R&D'],
  ['DOD-AFOSR', 'Science & Technology R&D'],
  ['DOD-DARPA', 'Science & Technology R&D'],
  ['DOD-ONR', 'Science & Technology R&D'],
  ['DOD-AMC', 'Science & Technology R&D'],
  ['DOE-ARPAE', 'Science & Technology R&D'],
  ['DOC-NIST', 'Science & Technology R&D'],
  ['DOD-AMRAA', 'Health & Wellness'],
  ['HHS-CDC', 'Health & Wellness'],
  ['HHS-HRSA', 'Health & Wellness'],
  ['HHS-IHS', 'Health & Wellness'],
  ['HHS-SAMHS', 'Health & Wellness'],
  ['HHS-ACF', 'Community & Social Services'],
  ['USDOJ', 'Public Safety & Emergency Management'],
  ['DHS', 'Public Safety & Emergency Management'],
  ['DOD-COE', 'Environment & Natural Resources'],
  ['DOI', 'Environment & Natural Resources'],
  ['DOC-DOCNOAA', 'Environment & Natural Resources'],
  ['EPA', 'Environment & Natural Resources'],
  ['USDA', 'Agriculture & Rural Development'],
  ['HUD', 'Housing & Urban Development'],
  ['IMLS', 'Arts & Culture'],
  ['NEA', 'Arts & Culture'],
  ['NEH', 'Arts & Culture'],
  ['DOS', 'International & Diplomatic Affairs'],
  ['DOL-ILAB', 'International & Diplomatic Affairs'],
  ['DOL-ETA', 'Education & Workforce Development'],
  ['ED', 'Education & Workforce Development'],
  ['DOC-EDA', 'Small Business & Economic Development'],
  ['SBA', 'Small Business & Economic Development'],
  ['VA', 'Veterans & Military Services'],
];

function agencyDomain(agencyCode: string | null): string | null {
  if (!agencyCode) return null;
  const code = agencyCode.toUpperCase();
  // "HHS-NIH" covers HHS-NIH11; a bare top-level code like "ED" only covers "ED" and
  // "ED-…", never an unrelated code that merely starts with the same letters.
  const hit = AGENCY_DOMAINS.find(([prefix]) =>
    prefix.includes('-') ? code.startsWith(prefix) : code === prefix || code.startsWith(`${prefix}-`),
  );
  return hit ? hit[1] : null;
}

// Where a non-Grants.gov row was listed, for the "why you matched" reason — it used to
// say "Hello Alice" for every non-federal source, including SBA.gov's own page.
function sourceLabel(opp: RawFundingOpportunity): string {
  if (opp.source === 'sba_gov') return 'SBA.gov';
  return opp.agency_name || 'a small-business grant site';
}

export function matchOpportunity(opp: RawFundingOpportunity, profile: BusinessProfile): MatchResult {
  const status = opp.status ?? '';
  const codes = opp.eligibility_codes ?? [];

  // Grants.gov's numeric applicant-type facet (00-99) only exists on Grants.gov rows —
  // a non-federal source (e.g. Hello Alice) has no such field, but its entire premise
  // is a small-business audience, so it clears the hard eligibility filter by source
  // alone rather than by checking codes that will always be empty.
  const isGrantsGov = opp.source === 'grants_gov';
  // Grants.gov's status lags its own close date — 281 rows still said "posted" weeks
  // after closing (e.g. a coastal program that closed Sept 30, still listed in late
  // October), so the date is checked directly rather than trusting the status label.
  const isPastClose = opp.close_date != null && opp.close_date < todayIso();
  const isOpen = OPEN_STATUSES.has(status) && !isPastClose;
  // A freshly-synced Grants.gov "shell" row (see syncOpportunityShells() in
  // grantsSync.ts) has no eligibility_codes yet — detail hasn't been fetched. That's
  // not the same as "not business-eligible": the search query that found this row in
  // the first place was already filtered to the business-eligible codes (22|23|25|99),
  // so Grants.gov itself already confirmed eligibility — we just don't have the exact
  // code breakdown to display yet. Treating an empty list as ineligible here would
  // silently hide every not-yet-enriched grant from matches until its detail-fetch
  // pass runs, days later. description is null only for these not-yet-enriched rows
  // (every other source, and every enriched Grants.gov row, always sets it).
  const isPendingEnrichment = isGrantsGov && opp.description === null;
  const eligibleCodes = eligibleCodesFor(profile.organizationType);
  const hasBusinessEligibility = isGrantsGov
    ? isPendingEnrichment || codes.some((c) => eligibleCodes.has(c))
    : !isClosedToTenants(opp);
  const isOpenToTenant =
    !isForeignMission(opp) &&
    !(isGrantsGov && isSbaResourcePartnerSolicitation(opp)) &&
    !(profile.organizationType === 'for_profit' && excludesForProfits(opp)) &&
    !(profile.organizationType === 'nonprofit' && excludesNonprofits(opp));

  if (!isOpen || !hasBusinessEligibility || !isOpenToTenant) {
    return { eligible: false, matchPct: 0, reasons: [], caveats: [] };
  }

  const reasons: string[] = [];
  const caveats: string[] = [];
  let score = 20; // base score for clearing the hard eligibility + open-status filter
  // Set by the checks below that conclude "you likely aren't eligible" (wrong state, wrong
  // owner group, wrong industry). A -40 alone wasn't enough: Sephora's beauty-only grant
  // still scored 61% for bEMG after its penalty, off bonuses that only matter if you can
  // apply at all. Capped at the end so a likely-ineligible grant never outranks one the
  // tenant can actually apply for — still listed, with the caveat saying why.
  let likelyIneligible = false;

  if (!isGrantsGov) {
    reasons.push(`Listed as a small-business opportunity on ${sourceLabel(opp)}`);
    score += 8;
  } else if (eligibleCodes.has('12') && codes.includes('12')) {
    reasons.push('Eligible applicant type: Nonprofits with 501(c)(3) status');
    score += 8;
  } else if (eligibleCodes.has('13') && codes.includes('13')) {
    reasons.push('Eligible applicant type: Nonprofits without 501(c)(3) status');
    score += 6;
  } else if (eligibleCodes.has('23') && codes.includes('23')) {
    reasons.push('Eligible applicant type: Small businesses');
    score += 8;
  } else if (eligibleCodes.has('22') && codes.includes('22')) {
    reasons.push('Eligible applicant type: For-profit organizations');
    score += 5;
  } else if (codes.includes('99')) {
    reasons.push('Eligibility: Unrestricted — open to any entity type');
    score += 3;
  } else if (codes.includes('25')) {
    reasons.push('Eligibility: "Others" — check the full announcement for details');
    score += 2;
  }

  if (status === 'posted') {
    reasons.push('Currently open for applications');
    score += 5;
  } else {
    reasons.push('Forecasted — not open yet, but expected soon');
    score += 3;
  }

  // Real case that surfaced this: an NSF "Geospace Cluster" solicitation (astrophysics/
  // space-weather research, 12,769 characters long) scored 85% for a small community
  // arts nonprofit purely on keyword overlap — "black" from the standard "Historically
  // Black Colleges and Universities" eligibility boilerplate at character 10,259,
  // "community" from "the AGS research community" at 2,874, and "small" from
  // "Distributed Array of Small Instruments" at 5,719. None of that is about the
  // grant's actual subject — federal solicitations routinely bury generic diversity/
  // eligibility/program-list boilerplate deep in long descriptions, and unlike the
  // earlier buzzword-stopword fix, these are real, non-generic words (a grant that's
  // actually about Black-owned businesses or community programs SHOULD match on them).
  // The fix isn't blocklisting words, it's not reading that far: a grant's genuine
  // topical summary is at the top, so only that (plus the title) counts toward overlap.
  const DESCRIPTION_OVERLAP_WINDOW = 1200;
  const haystack = `${opp.title} ${(opp.description ?? '').slice(0, DESCRIPTION_OVERLAP_WINDOW)}`.toLowerCase();
  // Whole words only (plus a plain plural) — substring matching let "focus" hit
  // "focused" in 136 grants, "build" hit "building", and "media" hit "immediately".
  const matchedKeywords = profile.keywords.filter((kw) => new RegExp(`\\b${kw}(?:s|es)?\\b`).test(haystack));
  if (matchedKeywords.length > 0) {
    reasons.push(
      `Mentions your focus area${matchedKeywords.length > 1 ? 's' : ''}: ${matchedKeywords.join(', ')}`,
    );
    // The primary driver of score now, not a minor add-on — see STRONG_MATCH_THRESHOLD's
    // comment for why the weight was raised (10→15/cap 30→45) alongside shrinking the
    // bare-eligibility floor: real topical alignment should be what earns a high score.
    score += Math.min(matchedKeywords.length * 15, 45);
  }

  if (profile.capitalRequirementMin != null && opp.award_ceiling != null) {
    if (opp.award_ceiling >= profile.capitalRequirementMin) {
      reasons.push(`Award ceiling ($${opp.award_ceiling.toLocaleString()}) covers your stated capital need`);
      score += 15;
    }
  }

  // The structural check keyword overlap alone can't do: an NSF astrophysics grant and
  // a children's arts/culinary program can share incidental vocabulary (see the
  // description-window and buzzword-stopword fixes above) without being remotely the
  // same field. Domain classification is computed once per grant/tenant (never live —
  // see api/_lib/domainTaxonomy.ts) and stored, so this comparison is still a lookup
  // against a fact on file, not a live judgment call. Skipped entirely if either side
  // hasn't been classified yet, or if either is the deliberate "General Business
  // Support" wildcard (too broad to call a mismatch).
  //
  // Real case: 59% of grants (995 of 1,681) had no classification yet — the AI pass runs
  // on a free tier of ~20/day and never catches up — and an unclassified grant skipped
  // this check entirely, so it could never take the -30 a classified mismatch does.
  // Unrelated NIH/NSF research grants outranked properly-classified ones for bEMG as a
  // result. The funding agency is a stored fact that already settles the field for most
  // of that backlog (NIH funds research, CDC funds health, Interior funds environment),
  // so it stands in until the AI pass reaches the row. Anything still unknown after that
  // takes a small penalty so "unchecked" can't beat "checked and matched".
  const grantDomain = opp.primary_domain ?? agencyDomain(opp.agency_code);
  const domainFromAgency = !opp.primary_domain && grantDomain != null;
  if (profile.domain && !grantDomain && profile.domain !== WILDCARD_DOMAIN) {
    caveats.push("This grant's subject area hasn't been categorized yet, so it can't be checked against your business's focus.");
    score -= 10;
  }
  if (profile.domain && grantDomain) {
    const basis = domainFromAgency ? ' (based on the funding agency)' : '';
    if (profile.domain === grantDomain) {
      reasons.push(`Matches your business's classified focus: ${profile.domain}${basis}`);
      score += 20;
    } else if (profile.domain !== WILDCARD_DOMAIN && grantDomain !== WILDCARD_DOMAIN) {
      caveats.push(
        `This grant's primary focus (${grantDomain}${basis}) doesn't match your business's classified focus (${profile.domain}) — any keyword overlap above may be coincidental, not genuine alignment.`,
      );
      score -= 30;
    }
  }

  // Real case: Verizon's $10K Digital Ready grant — open to any U.S. small business, and
  // a near-perfect fit for bEMG — ranked #32, below dozens of federal listings, because
  // everything above rewards a grant for being ABOUT the tenant's subject. A general
  // small-business program isn't about any subject; "any industry" is the fit, so the
  // absence of keyword overlap isn't evidence against it. Only for non-Grants.gov rows,
  // whose whole audience is small businesses; on Grants.gov the wildcard mostly marks
  // broad agency notices. Not for a nonprofit tenant: these are business programs, and
  // "open to any small business" isn't a fit for an organization that isn't one.
  if (!isGrantsGov && opp.primary_domain === WILDCARD_DOMAIN && profile.organizationType !== 'nonprofit') {
    reasons.push('Open to small businesses in any industry — no subject-area match needed');
    score += 25;
  }

  const titleYear = latestTitleYear(opp.title);
  const currentYear = Number(todayIso().slice(0, 4));
  if (titleYear != null && titleYear <= currentYear - 2) {
    caveats.push(
      `This listing names FY ${titleYear} and has no close date on file — it may be an old notice that was never taken down. Check the announcement before spending time on it.`,
    );
    score -= 30;
  }

  if (profile.industryText) {
    const limitText = `${opp.title}. ${opp.applicant_eligibility_desc ?? ''}`;
    for (const limit of INDUSTRY_LIMITS) {
      if (limit.grant.test(limitText) && !limit.tenant.test(profile.industryText)) {
        caveats.push(
          `This program is limited to ${limit.label} — your Business DNA lists your industry as "${profile.industryText.split('\n')[0]}", so you likely aren't eligible.`,
        );
        score -= 40;
        likelyIneligible = true;
        break;
      }
    }
  }

  // Real case that surfaced this: a Spokane, WA-specific program surfacing as a top
  // match for a Mississippi-based tenant — neither keyword overlap nor domain
  // classification has any concept of "who is this actually open to, geographically."
  // Extracted in the same one-time AI pass as primary_domain (see
  // api/_lib/domainTaxonomy.ts), so — like the domain check above — this is a lookup
  // against a stored fact, not a live judgment call. Skipped if either side is unknown
  // (grant not yet classified, or tenant hasn't stated a location), and never treated
  // as a hard exclusion — a bad extraction shouldn't hide a genuinely good match, just
  // push it well below "strong match" with a caveat explaining why.
  if (opp.eligible_states && opp.eligible_states.length > 0) {
    if (profile.state) {
      if (opp.eligible_states.includes(profile.state)) {
        reasons.push(`Open to applicants in your state (${profile.state})`);
        score += 10;
      } else {
        caveats.push(
          `This grant is restricted to ${opp.eligible_states.join(', ')} — your business is listed in ${profile.state}, so you likely aren't eligible regardless of how well the keywords line up.`,
        );
        score -= 40;
        likelyIneligible = true;
      }
    } else {
      caveats.push(
        `This grant is restricted to specific states (${opp.eligible_states.join(', ')}) — add your business's location to Business DNA to see whether you qualify.`,
      );
      score -= 10;
    }
  }

  // Owner-targeted grants (see findOwnerRequirements above). Title + eligibility text is
  // where a program states who may apply, so a hit there is a restriction; a hit only in
  // the description ("especially encourages women-owned businesses") is a priority, which
  // earns a boost when the tenant fits but never a penalty when they don't. Like the
  // state check, a restriction the tenant fails is a big drop with a caveat rather than a
  // hard exclusion — a misread sentence shouldn't hide a grant outright.
  if (!isGrantsGov && !SERVES_GROUP_PATTERN.test(opp.applicant_eligibility_desc ?? '')) {
    // The eligibility text wins over the title when both name groups: "SoGal Black
    // Founder Startup Grant" reads as Black-owned, but its eligibility is Black women and
    // Black nonbinary founders — the title is a summary, the eligibility is the rule.
    const fromEligibility = findOwnerRequirements(opp.applicant_eligibility_desc ?? '');
    const restricted = fromEligibility.length > 0 ? fromEligibility : findOwnerRequirements(opp.title);
    const priority = restricted.length > 0 ? [] : findOwnerRequirements(haystack);
    const owner = profile.owner;
    if (restricted.length > 0) {
      const who = describeRequirements(restricted);
      if (owner && restricted.some((r) => meetsRequirement(r, owner.groups))) {
        reasons.push(`Open to ${who} — matches your owner profile`);
        score += 15;
      } else if (owner?.identityAnswered) {
        caveats.push(
          `This grant is for ${who} — based on the owner identity in your Business DNA, you likely aren't eligible regardless of how well the keywords line up.`,
        );
        score -= 40;
        likelyIneligible = true;
      } else {
        caveats.push(
          `This grant is for ${who} — add Majority Owner Identity in Business DNA to see whether you qualify.`,
        );
        score -= 10;
      }
    } else if (priority.length > 0 && owner && priority.some((r) => meetsRequirement(r, owner.groups))) {
      reasons.push(`Prioritizes ${describeRequirements(priority)} — matches your owner profile`);
      score += 10;
    }
  }

  // A for-profit tenant never reaches here for these (see isOpenToTenant above); one
  // whose Ownership Structure is still blank gets told why it might not apply.
  if (!profile.organizationType && excludesForProfits(opp)) {
    caveats.push(
      "This grant says for-profit organizations aren't eligible — add your Ownership Structure in Business DNA to see whether you qualify.",
    );
    score -= 10;
  }

  if (isSttr(opp.title)) {
    caveats.push(
      'STTR requires a formal partnership with a U.S. nonprofit research institution (a named co-PI there, a subcontract) — not confirmed on file. Without one, this mechanism likely isn\'t viable regardless of how well the keywords line up.',
    );
    score -= 35;
  }

  if (likelyIneligible) score = Math.min(score, LIKELY_INELIGIBLE_CAP);

  return { eligible: true, matchPct: Math.max(0, Math.min(100, score)), reasons, caveats };
}
