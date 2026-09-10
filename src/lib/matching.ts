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
}

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
const OPEN_STATUSES = new Set(['posted', 'forecasted']);

// The highest score reachable from bare eligibility alone — clearing the hard filter
// (40) plus the best-case eligibility-type bonus (15, small business) plus the best-case
// status bonus (10, posted) — with ZERO keyword overlap or capital fit. Any score at or
// below this reflects "technically eligible," not genuine alignment with what the
// business actually does. A score above it is only reachable once at least one real
// topical/capital signal has kicked in, which is why it's the right line for "worth
// counting as identified funding" rather than an arbitrary round number.
const BARE_ELIGIBILITY_CEILING = 40 + 15 + 10;

// Threshold above which a match reflects more than bare eligibility — used to decide
// which matches are strong enough to count toward "identified" funding on the Dashboard,
// not just technically-eligible noise.
export const STRONG_MATCH_THRESHOLD = BARE_ELIGIBILITY_CEILING + 5;

// STTR (not SBIR) statutorily requires the small business to have a formal cooperative
// R&D partnership with a U.S. nonprofit research institution — a named co-PI there, a
// subcontract, a defined division of labor performing at least 30% of the work. This is
// real, stable domain knowledge (same basis as the NIH review-criteria detection
// elsewhere in this app), not something Grants.gov exposes as a structured field, so
// keyword/eligibility-code matching alone can't catch it — it has to be checked directly.
function isSttr(title: string): boolean {
  return /\bSTTR\b/i.test(title) || /\bR4[12]\b/.test(title);
}

export function matchOpportunity(opp: RawFundingOpportunity, profile: BusinessProfile): MatchResult {
  const status = opp.status ?? '';
  const codes = opp.eligibility_codes ?? [];

  // Grants.gov's numeric applicant-type facet (00-99) only exists on Grants.gov rows —
  // a non-federal source (e.g. Hello Alice) has no such field, but its entire premise
  // is a small-business audience, so it clears the hard eligibility filter by source
  // alone rather than by checking codes that will always be empty.
  const isGrantsGov = opp.source === 'grants_gov';
  const isOpen = OPEN_STATUSES.has(status);
  const hasBusinessEligibility = isGrantsGov ? codes.some((c) => BUSINESS_ELIGIBLE_CODES.has(c)) : true;

  if (!isOpen || !hasBusinessEligibility) {
    return { eligible: false, matchPct: 0, reasons: [], caveats: [] };
  }

  const reasons: string[] = [];
  let score = 40; // base score for clearing the hard eligibility + open-status filter

  if (!isGrantsGov) {
    reasons.push('Listed as a small-business opportunity on Hello Alice');
    score += 15;
  } else if (codes.includes('12')) {
    reasons.push('Eligible applicant type: Nonprofits with 501(c)(3) status');
    score += 15;
  } else if (codes.includes('13')) {
    reasons.push('Eligible applicant type: Nonprofits without 501(c)(3) status');
    score += 12;
  } else if (codes.includes('23')) {
    reasons.push('Eligible applicant type: Small businesses');
    score += 15;
  } else if (codes.includes('22')) {
    reasons.push('Eligible applicant type: For-profit organizations');
    score += 10;
  } else if (codes.includes('99')) {
    reasons.push('Eligibility: Unrestricted — open to any entity type');
    score += 5;
  } else if (codes.includes('25')) {
    reasons.push('Eligibility: "Others" — check the full announcement for details');
    score += 3;
  }

  if (status === 'posted') {
    reasons.push('Currently open for applications');
    score += 10;
  } else {
    reasons.push('Forecasted — not open yet, but expected soon');
    score += 5;
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
  const matchedKeywords = profile.keywords.filter((kw) => haystack.includes(kw));
  if (matchedKeywords.length > 0) {
    reasons.push(
      `Mentions your focus area${matchedKeywords.length > 1 ? 's' : ''}: ${matchedKeywords.join(', ')}`,
    );
    score += Math.min(matchedKeywords.length * 10, 30);
  }

  if (profile.capitalRequirementMin != null && opp.award_ceiling != null) {
    if (opp.award_ceiling >= profile.capitalRequirementMin) {
      reasons.push(`Award ceiling ($${opp.award_ceiling.toLocaleString()}) covers your stated capital need`);
      score += 10;
    }
  }

  const caveats: string[] = [];
  if (isSttr(opp.title)) {
    caveats.push(
      'STTR requires a formal partnership with a U.S. nonprofit research institution (a named co-PI there, a subcontract) — not confirmed on file. Without one, this mechanism likely isn\'t viable regardless of how well the keywords line up.',
    );
    score -= 35;
  }

  return { eligible: true, matchPct: Math.max(0, Math.min(100, score)), reasons, caveats };
}
