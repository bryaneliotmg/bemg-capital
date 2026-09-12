import { createClient } from '@supabase/supabase-js';
import { classifyUnclassifiedOpportunities } from './domainTaxonomy.js';

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

export interface ShellSyncResult {
  totalHits: number;
  upserted: number;
}

export interface EnrichResult {
  attempted: number;
  enriched: number;
  errorCount: number;
  errors: string[];
  remaining: number;
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
      // Agency contact fields are nested under synopsis/forecast, same level as
      // synopsisDesc/awardFloor — confirmed against real stored raw_detail.
      const agencyContactName: string | null = detailSource.agencyContactName ?? null;
      const agencyContactEmail: string | null = detailSource.agencyContactEmail ?? null;
      const agencyContactPhone: string | null = detailSource.agencyContactPhone ?? null;

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
        agency_contact_name: agencyContactName,
        agency_contact_email: agencyContactEmail,
        agency_contact_phone: agencyContactPhone,
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

  // Classify only whatever's newly synced (or was somehow never classified) — a grant
  // already classified from a prior sync keeps its stored domain untouched, since this
  // is a one-time-per-grant AI call, not something re-run on every daily sync. Capped
  // to 4 here, same as api/backfill-domains.ts's default: each classification is
  // paced ~13s apart to respect Gemini's per-minute quota, so classifying an unbounded
  // number of newly-synced grants in this same request risks blowing the function's
  // 60s ceiling on any sync that pulls in more than a handful — the sync itself (and
  // the data it already wrote) would still succeed, but the response would never make
  // it back, making a real success look like a failure. Anything past the first 4
  // gets picked up by the next daily backfill-domains run instead.
  await classifyUnclassifiedOpportunities(supabase, syncedIds.slice(0, 4));

  return {
    totalHits: searchJson?.data?.hitCount ?? 0,
    fetched: hits.length,
    synced,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    syncedIds,
  };
}

// Real gap this fixes: syncGrants() above fetches full per-opportunity detail (a
// separate network call per hit) for whatever it's given, so it was only ever called
// with a small `rows` value (25/day via the cron, 20 per user search) to stay inside a
// serverless function's time budget. But Grants.gov's own business-eligibility filter
// (22|23|25|99) currently matches ~1,430 open/forecasted opportunities — a user
// searching Grants.gov directly found real, relevant hits this app had never synced at
// all, because the daily cron was only ever seeing the top 25 of 1,430.
//
// The search2 endpoint itself, with no per-hit detail fetch, comfortably returns up to
// 1,000 rows in one call and supports startRecordNum for paging past that — so the fix
// is to sync the FULL current catalog's lightweight search-hit fields (title, agency,
// dates, status) in one fast pass, then let enrichOpportunityDetails() below fill in
// the heavier fields (description, award amounts, eligibility codes) for a bounded
// batch per run, same trickle shape already used for AI domain classification.
//
// The upsert here deliberately omits description/award_floor/award_ceiling/
// eligibility_codes/etc. entirely (not even as null) — Postgres's ON CONFLICT DO
// UPDATE only touches columns actually present in the payload, so a row that already
// has real detail from a prior enrichment pass keeps it untouched; a brand-new row
// just gets NULL for whatever wasn't provided, same as before enrichment ever ran.
export async function syncOpportunityShells(): Promise<ShellSyncResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let totalHits = 0;
  let upserted = 0;
  let startRecordNum = 0;
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 6; // safety cap — 6,000 rows is well past today's ~1,430, room to grow

  for (let page = 0; page < MAX_PAGES; page++) {
    const searchRes = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: PAGE_SIZE,
        startRecordNum,
        oppStatuses: 'forecasted|posted',
        eligibilities: BUSINESS_ELIGIBILITY_FILTER,
        keyword: '',
      }),
    });
    const searchJson = await searchRes.json();
    const hits: SearchHit[] = searchJson?.data?.oppHits ?? [];
    totalHits = searchJson?.data?.hitCount ?? totalHits;
    if (hits.length === 0) break;

    const rows = hits.map((hit) => ({
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
      source: 'grants_gov',
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('funding_opportunities').upsert(rows);
    if (error) throw error;
    upserted += rows.length;

    startRecordNum += PAGE_SIZE;
    if (startRecordNum >= totalHits) break;
  }

  return { totalHits, upserted };
}

// Bounded trickle that fills in the heavier fields (description, award amounts,
// eligibility codes, etc.) for whatever syncOpportunityShells() above has synced but
// hasn't been detail-fetched yet — "needs detail" is simply description IS NULL,
// since a shell row never sets it and a fully-enriched row always does. Sequential,
// not batched: Grants.gov's detail endpoint has no documented rate limit (unlike the
// Gemini quota this app already had to work around), and at ~250-300ms per call, a
// batch of 100 fits comfortably inside a 60s function with real margin to spare.
export async function enrichOpportunityDetails(limit = 100): Promise<EnrichResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: shells, error: selectError } = await supabase
    .from('funding_opportunities')
    .select('id')
    .eq('source', 'grants_gov')
    .is('description', null)
    .limit(limit);
  if (selectError) throw selectError;

  const errors: string[] = [];
  let enriched = 0;

  for (const shell of shells ?? []) {
    try {
      const detailRes = await fetch(DETAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: Number(shell.id) }),
      });
      const detailJson = await detailRes.json();
      const detail = detailJson?.data ?? {};
      const detailSource = detail.synopsis ?? detail.forecast ?? {};
      const description: string = detailSource.synopsisDesc ?? detailSource.forecastDesc ?? '';
      const eligibilityCodes: string[] = Array.isArray(detailSource.applicantTypes)
        ? detailSource.applicantTypes
            .map((a: unknown) => (typeof a === 'string' ? a : String((a as { id?: string })?.id ?? '')))
            .filter((code: string) => code.length > 0)
        : [];
      const fundingCategories = Array.isArray(detailSource.fundingActivityCategories)
        ? detailSource.fundingActivityCategories
        : [];

      const { error: updateError } = await supabase
        .from('funding_opportunities')
        .update({
          award_floor: parseAward(detailSource.awardFloor),
          award_ceiling: parseAward(detailSource.awardCeiling),
          eligibility_codes: eligibilityCodes,
          funding_categories: fundingCategories,
          // A description can genuinely be an empty string from Grants.gov itself
          // (rare, but seen) — fall back to a single space rather than '' so this row
          // never matches `.is('description', null)` again and gets endlessly retried.
          description: description || ' ',
          announcement_url: detailSource.fundingDescLinkUrl ?? null,
          applicant_eligibility_desc: detailSource.applicantEligibilityDesc ?? null,
          agency_contact_name: detailSource.agencyContactName ?? null,
          agency_contact_email: detailSource.agencyContactEmail ?? null,
          agency_contact_phone: detailSource.agencyContactPhone ?? null,
          raw_detail: detail,
        })
        .eq('id', shell.id);
      if (updateError) throw updateError;
      enriched++;
    } catch (err) {
      errors.push(`${shell.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const { count: remaining } = await supabase
    .from('funding_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'grants_gov')
    .is('description', null);

  return { attempted: shells?.length ?? 0, enriched, errorCount: errors.length, errors: errors.slice(0, 10), remaining: remaining ?? 0 };
}
