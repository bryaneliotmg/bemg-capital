import { createClient } from '@supabase/supabase-js';

const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const DETAIL_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';

// Grants.gov applicant-type facet codes plausible for a for-profit small business:
// 22 = For profit organizations other than small businesses, 23 = Small businesses,
// 25 = Others (see eligibility text), 99 = Unrestricted.
const BUSINESS_ELIGIBILITY_FILTER = '22|23|25|99';

interface SearchHit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  cfdaList?: string[];
}

export interface SyncResult {
  totalHits: number;
  fetched: number;
  synced: number;
  errorCount: number;
  errors: string[];
  syncedIds: string[];
}

function mmddyyyyToIso(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function parseAward(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Searches Grants.gov and upserts results into funding_opportunities. Shared by
 * the scheduled cron sync (no keyword) and the on-demand search endpoint
 * (keyword supplied by a user) so both write through the exact same parsing.
 */
export async function syncGrants(opts: { keyword?: string; rows?: number }): Promise<SyncResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const searchRes = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: opts.rows ?? 25,
      oppStatuses: 'forecasted|posted',
      eligibilities: BUSINESS_ELIGIBILITY_FILTER,
      keyword: opts.keyword ?? '',
    }),
  });
  const searchJson = await searchRes.json();
  const hits: SearchHit[] = searchJson?.data?.oppHits ?? [];

  let synced = 0;
  const errors: string[] = [];
  const syncedIds: string[] = [];

  for (const hit of hits) {
    try {
      const detailRes = await fetch(DETAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: hit.id }),
      });
      const detailJson = await detailRes.json();
      const detail = detailJson?.data ?? {};

      // Grants.gov nests rich fields under `synopsis` for posted opportunities or
      // `forecast` for forecasted ones. applicantTypes entries are {id, description}
      // (id = the facet code, e.g. "23" for Small businesses); awardFloor/
      // awardCeiling are either numeric strings or the literal string "none";
      // fundingActivityCategories entries are {id, description} too — stored as-is
      // (Grants.gov's own labels, not a guessed/hardcoded map).
      const detailSource = detail.synopsis ?? detail.forecast ?? {};
      const description: string = detailSource.synopsisDesc ?? detailSource.forecastDesc ?? '';
      const awardFloor = parseAward(detailSource.awardFloor);
      const awardCeiling = parseAward(detailSource.awardCeiling);
      const eligibilityCodes: string[] = Array.isArray(detailSource.applicantTypes)
        ? detailSource.applicantTypes
            .map((a: unknown) => (typeof a === 'string' ? a : String((a as { id?: string })?.id ?? '')))
            .filter((code: string) => code.length > 0)
        : [];
      const fundingCategories = Array.isArray(detailSource.fundingActivityCategories)
        ? detailSource.fundingActivityCategories
        : [];
      const announcementUrl: string | null = detailSource.fundingDescLinkUrl ?? null;
      const applicantEligibilityDesc: string | null = detailSource.applicantEligibilityDesc ?? null;

      const { error } = await supabase.from('funding_opportunities').upsert({
        id: String(hit.id),
        opportunity_number: hit.number,
        title: hit.title,
        agency_name: hit.agency,
        agency_code: hit.agencyCode,
        cfda_list: hit.cfdaList ?? [],
        doc_type: hit.docType,
        status: hit.oppStatus,
        open_date: mmddyyyyToIso(hit.openDate),
        close_date: mmddyyyyToIso(hit.closeDate),
        award_floor: awardFloor,
        award_ceiling: awardCeiling,
        eligibility_codes: eligibilityCodes,
        funding_categories: fundingCategories,
        description,
        announcement_url: announcementUrl,
        applicant_eligibility_desc: applicantEligibilityDesc,
        raw_detail: detail,
        synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      synced++;
      syncedIds.push(String(hit.id));
    } catch (err) {
      errors.push(`${hit.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    totalHits: searchJson?.data?.hitCount ?? 0,
    fetched: hits.length,
    synced,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    syncedIds,
  };
}
