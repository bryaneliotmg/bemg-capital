import { supabase } from './supabase';
import { matchOpportunity, type RawFundingOpportunity } from './matching';
import { BUSINESS_PROFILE_KEYWORDS } from '../data/sampleData';

export interface MatchedOpportunity {
  id: string;
  name: string;
  funder: string;
  amount: string;
  /** Raw award ceiling (or floor if no ceiling), for aggregate stats — null if Grants.gov gave us neither. */
  awardAmount: number | null;
  deadline: string;
  matchPct: number;
  evidence: string[];
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

export async function getMatchedOpportunities(): Promise<MatchedOpportunity[]> {
  const { data, error } = await supabase
    .from('funding_opportunities')
    .select(
      'id, opportunity_number, title, agency_name, agency_code, cfda_list, doc_type, status, open_date, close_date, award_floor, award_ceiling, eligibility_codes, description',
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
        funder: opp.agency_name || 'Federal agency',
        amount: formatAmount(opp.award_floor, opp.award_ceiling),
        awardAmount: opp.award_ceiling ?? opp.award_floor ?? null,
        deadline: formatDeadline(opp.close_date),
        matchPct: result.matchPct,
        evidence: result.reasons,
      };
      return matched;
    })
    .filter((x): x is MatchedOpportunity => x !== null)
    .sort((a, b) => b.matchPct - a.matchPct);
}
