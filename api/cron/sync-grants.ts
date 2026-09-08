import type { VercelRequest, VercelResponse } from '@vercel/node';
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

function mmddyyyyToIso(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const searchRes = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: 25,
        oppStatuses: 'forecasted|posted',
        eligibilities: BUSINESS_ELIGIBILITY_FILTER,
      }),
    });
    const searchJson = await searchRes.json();
    const hits: SearchHit[] = searchJson?.data?.oppHits ?? [];

    let synced = 0;
    const errors: string[] = [];

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
        // `forecast` for forecasted ones — field names beyond what we confirmed live
        // (forecastDesc) are a best-effort read; raw_detail keeps the full response
        // so nothing is lost if a field name here turns out to be slightly off.
        const detailSource = detail.synopsis ?? detail.forecast ?? {};
        const description: string = detailSource.synopsisDesc ?? detailSource.forecastDesc ?? '';
        const awardFloor = detailSource.awardFloor != null ? Number(detailSource.awardFloor) : null;
        const awardCeiling = detailSource.awardCeiling != null ? Number(detailSource.awardCeiling) : null;
        const eligibilityCodes: string[] = Array.isArray(detailSource.applicantTypes)
          ? detailSource.applicantTypes.map((a: unknown) =>
              typeof a === 'string' ? a : String((a as { code?: string })?.code ?? ''),
            )
          : [];

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
          description,
          raw_detail: detail,
          synced_at: new Date().toISOString(),
        });
        if (error) throw error;
        synced++;
      } catch (err) {
        errors.push(`${hit.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    res.status(200).json({
      ok: true,
      totalHits: searchJson?.data?.hitCount ?? 0,
      fetched: hits.length,
      synced,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
