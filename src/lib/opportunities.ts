import { supabase } from './supabase';
import { matchOpportunity, type RawFundingOpportunity } from './matching';
import { BUSINESS_PROFILE_KEYWORDS } from '../data/sampleData';

export interface MatchedOpportunity {
  id: string;
  name: string;
  opportunityNumber: string | null;
  funder: string;
  agencyCode: string | null;
  status: string | null;
  docType: string | null;
  cfdaList: string[];
  amount: string;
  /** Raw award ceiling (or floor if no ceiling), for aggregate stats — null if Grants.gov gave us neither. */
  awardAmount: number | null;
  openDate: string | null;
  closeDate: string | null;
  deadline: string;
  matchPct: number;
  evidence: string[];
  eligibilityCodes: string[];
  description: string;
  applicantEligibilityDesc: string | null;
  announcementUrl: string | null;
}

function formatAmount(floor: number | null, ceiling: number | null): string {
  if (floor == null && ceiling == null) return 'Amount not specified';
  if (floor != null && ceiling != null && floor !== ceiling) {
    return `$${floor.toLocaleString()} – $${ceiling.toLocaleString()}`;
  }
  const amount = ceiling ?? floor;
  return `Up to $${amount!.toLocaleString()}`;
}

function formatDeadline(closeDate: string | null): string {
  if (!closeDate) return 'No deadline listed';
  const days = Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Deadline passed';
  if (days === 0) return 'Closes today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

// Grants.gov synopsis text comes as basic HTML (e.g. wrapped in <p>). Strip tags
// rather than rendering raw HTML from an external source — this is untrusted
// third-party content, so it's rendered as plain text, never dangerouslySetInnerHTML.
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function getMatchedOpportunities(): Promise<MatchedOpportunity[]> {
  const { data, error } = await supabase
    .from('funding_opportunities')
    .select(
      'id, opportunity_number, title, agency_name, agency_code, cfda_list, doc_type, status, open_date, close_date, award_floor, award_ceiling, eligibility_codes, description, announcement_url, applicant_eligibility_desc',
    );

  if (error) throw error;

  const rows = (data ?? []) as RawFundingOpportunity[];

  return rows
    .map((opp) => {
      const result = matchOpportunity(opp, { keywords: BUSINESS_PROFILE_KEYWORDS });
      if (!result.eligible) return null;
      const matched: MatchedOpportunity = {
        id: opp.id,
        name: opp.title,
        opportunityNumber: opp.opportunity_number,
        funder: opp.agency_name || 'Federal agency',
        agencyCode: opp.agency_code,
        status: opp.status,
        docType: opp.doc_type,
        cfdaList: opp.cfda_list ?? [],
        amount: formatAmount(opp.award_floor, opp.award_ceiling),
        awardAmount: opp.award_ceiling ?? opp.award_floor ?? null,
        openDate: opp.open_date,
        closeDate: opp.close_date,
        deadline: formatDeadline(opp.close_date),
        matchPct: result.matchPct,
        evidence: result.reasons,
        eligibilityCodes: opp.eligibility_codes ?? [],
        description: opp.description ? stripHtml(opp.description) : 'No description provided.',
        applicantEligibilityDesc: opp.applicant_eligibility_desc ? stripHtml(opp.applicant_eligibility_desc) : null,
        announcementUrl: opp.announcement_url,
      };
      return matched;
    })
    .filter((x): x is MatchedOpportunity => x !== null)
    .sort((a, b) => b.matchPct - a.matchPct);
}
