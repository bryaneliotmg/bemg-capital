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
  const caveats: string[] = [];
  let score = 20; // base score for clearing the hard eligibility + open-status filter

  if (!isGrantsGov) {
    reasons.push('Listed as a small-business opportunity on Hello Alice');
    score += 8;
  } else if (codes.includes('12')) {
    reasons.push('Eligible applicant type: Nonprofits with 501(c)(3) status');
    score += 8;
  } else if (codes.includes('13')) {
    reasons.push('Eligible applicant type: Nonprofits without 501(c)(3) status');
    score += 6;
  } else if (codes.includes('23')) {
    reasons.push('Eligible applicant type: Small businesses');
    score += 8;
  } else if (codes.includes('22')) {
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
  const matchedKeywords = profile.keywords.filter((kw) => haystack.includes(kw));
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
  if (profile.domain && opp.primary_domain) {
    if (profile.domain === opp.primary_domain) {
      reasons.push(`Matches your business's classified focus: ${profile.domain}`);
      score += 20;
    } else if (profile.domain !== WILDCARD_DOMAIN && opp.primary_domain !== WILDCARD_DOMAIN) {
      caveats.push(
        `This grant's primary focus (${opp.primary_domain}) doesn't match your business's classified focus (${profile.domain}) — any keyword overlap above may be coincidental, not genuine alignment.`,
      );
      score -= 30;
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
      }
    } else {
      caveats.push(
        `This grant is restricted to specific states (${opp.eligible_states.join(', ')}) — add your business's location to Business DNA to see whether you qualify.`,
      );
      score -= 10;
    }
  }

  if (isSttr(opp.title)) {
    caveats.push(
      'STTR requires a formal partnership with a U.S. nonprofit research institution (a named co-PI there, a subcontract) — not confirmed on file. Without one, this mechanism likely isn\'t viable regardless of how well the keywords line up.',
    );
    score -= 35;
  }

  return { eligible: true, matchPct: Math.max(0, Math.min(100, score)), reasons, caveats };
}
