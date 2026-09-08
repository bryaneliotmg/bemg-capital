// Deterministic grant matching — no LLM at match time. Every reason string below
// cites a structured fact that was actually checked, so "why you matched" stays
// a truthful readout rather than a generated-sounding claim.

export interface RawFundingOpportunity {
  id: string;
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
}

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
}

// Grants.gov applicant-type facet codes plausible for a for-profit small business.
const BUSINESS_ELIGIBLE_CODES = new Set(['22', '23', '25', '99']);
const OPEN_STATUSES = new Set(['posted', 'forecasted']);

export function matchOpportunity(opp: RawFundingOpportunity, profile: BusinessProfile): MatchResult {
  const status = opp.status ?? '';
  const codes = opp.eligibility_codes ?? [];

  const isOpen = OPEN_STATUSES.has(status);
  const hasBusinessEligibility = codes.some((c) => BUSINESS_ELIGIBLE_CODES.has(c));

  if (!isOpen || !hasBusinessEligibility) {
    return { eligible: false, matchPct: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let score = 40; // base score for clearing the hard eligibility + open-status filter

  if (codes.includes('23')) {
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

  const haystack = `${opp.title} ${opp.description ?? ''}`.toLowerCase();
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

  return { eligible: true, matchPct: Math.max(0, Math.min(100, score)), reasons };
}
