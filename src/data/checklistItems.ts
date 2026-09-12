import type { MatchedOpportunity } from '../lib/opportunities';

export interface ChecklistItemDef {
  id: string;
  label: string;
  /** Why this specific grant needs it — not a generic tip, a reason tied to the fact
   * that triggered this item (an eligibility code, a phrase in the actual listing). */
  reason: string;
}

export type ChecklistItemStatus = 'pending' | 'complete' | 'not_applicable';

export interface ChecklistItemState {
  status: ChecklistItemStatus;
  note?: string;
}

// Deterministic, rule-based — NOT AI-generated. This app's own matching.ts states the
// bar: "no LLM at match time... every reason cites a fact that was actually checked."
// A compliance checklist is higher-stakes than the AI-assisted narrative drafting
// elsewhere in this app (which is explicitly advisory prose the applicant re-edits) —
// implying "you're missing X" wrongly, or missing that something IS required, is
// actively harmful, not just lower-quality. Every rule below is a plain substring/regex
// check against a fact already on the opportunity record, same category of check as
// matching.ts's own ELIGIBILITY_LABELS lookups — nothing here is inferred or guessed.
function haystack(opportunity: MatchedOpportunity): string {
  return `${opportunity.description} ${opportunity.applicantEligibilityDesc ?? ''}`;
}

export function getChecklistItems(opportunity: MatchedOpportunity): ChecklistItemDef[] {
  const items: ChecklistItemDef[] = [];
  const text = haystack(opportunity);
  const codes = opportunity.eligibilityCodes;

  // Only Grants.gov federal opportunities populate eligibility_codes at all (see
  // matching.ts's isGrantsGov branch) — a non-empty list is itself the fact that this
  // is a federal award requiring the standard federal registration stack.
  if (codes.length > 0) {
    items.push({
      id: 'sam_gov_registration',
      label: 'Active SAM.gov registration & Unique Entity ID (UEI)',
      reason: 'Required for every federal award — this grant is listed on Grants.gov with a formal applicant-type facet.',
    });
    items.push({
      id: 'authorized_rep_signature',
      label: "Authorized representative's signature on the final application",
      reason: 'Every SF-424 federal application package requires a signed certification from an authorized representative.',
    });
  }

  if (codes.includes('12')) {
    items.push({
      id: 'determination_letter_501c3',
      label: 'IRS 501(c)(3) determination letter',
      reason: 'This grant\'s eligible applicant types include "Nonprofits with 501(c)(3) status" — that status has to be documented, not just claimed.',
    });
  }

  if (codes.includes('13')) {
    items.push({
      id: 'nonprofit_verification_non_501c3',
      label: 'Documentation of nonprofit status (non-501(c)(3) path)',
      reason: 'This grant accepts nonprofits without 501(c)(3) status specifically — the funder will still need some form of nonprofit verification appropriate to that category.',
    });
  }

  if (/letters?\s+of\s+support/i.test(text)) {
    items.push({
      id: 'letters_of_support',
      label: 'Letter(s) of support from named partners',
      reason: "This opportunity's own listing mentions letters of support.",
    });
  }

  if (/\b(NICRA|negotiated indirect cost|indirect cost rate)\b/i.test(text)) {
    items.push({
      id: 'indirect_cost_rate',
      label: 'Negotiated Indirect Cost Rate Agreement (NICRA), or a de minimis rate election',
      reason: "This opportunity's own listing references an indirect cost rate.",
    });
  }

  if (/\b(board resolution|governing body approval)\b/i.test(text)) {
    items.push({
      id: 'board_resolution',
      label: 'Board resolution or governing-body approval authorizing this application',
      reason: "This opportunity's own listing references a board resolution or governing-body approval.",
    });
  }

  if (/\b(matching funds?|cost[- ]shar(e|ing)|dollar[- ]for[- ]dollar match)\b/i.test(text)) {
    items.push({
      id: 'matching_funds',
      label: 'Non-federal matching/cost-share funds secured or committed',
      reason: "This opportunity's own listing states a matching or cost-share requirement.",
    });
  }

  return items;
}
