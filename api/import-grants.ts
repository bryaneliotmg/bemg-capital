import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface ExtractedGrant {
  title: string;
  description: string;
  amount: string | null;
  status: 'open' | 'closed' | 'unknown';
  applyUrl: string | null;
  eligibilityNotes: string | null;
}

interface ImportBody {
  source: string;
  sourceLabel: string;
  grants: ExtractedGrant[];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseAmount(amount: string | null): number | null {
  if (!amount) return null;
  const num = Number(amount.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

// Manual counterpart to api/cron/sync-grants.ts, for sources that can't be synced
// automatically (a site blocking headless/datacenter traffic — see the removed
// sync-hello-alice for why that route was dropped). The user browses the site
// themselves, has Claude extract listings via buildGrantExtractionPrompt() in
// src/lib/prompts.ts, and pastes the resulting JSON into the admin-only importer on
// the Grant Matches page — this endpoint just validates and upserts that JSON,
// exactly the shape matchOpportunity()'s source-aware branch in src/lib/matching.ts
// already expects (non-Grants.gov rows clear eligibility by source, not by code).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  const body = req.body as ImportBody;
  if (!body?.source || !body?.sourceLabel || !Array.isArray(body.grants)) {
    res.status(400).json({ error: 'Expected { source, sourceLabel, grants: [] } — see buildGrantExtractionPrompt output' });
    return;
  }
  if (body.source === 'grants_gov') {
    res.status(400).json({ error: '"grants_gov" is reserved for the automated Grants.gov sync' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  let imported = 0;
  const errors: string[] = [];

  for (const grant of body.grants) {
    if (!grant.title || !grant.description) {
      errors.push(`Skipped a grant missing title/description: ${JSON.stringify(grant).slice(0, 100)}`);
      continue;
    }
    try {
      const { error } = await supabase.from('funding_opportunities').upsert({
        id: `${body.source}:${slugify(grant.title)}`,
        source: body.source,
        opportunity_number: null,
        title: grant.title,
        agency_name: body.sourceLabel,
        agency_code: null,
        cfda_list: [],
        doc_type: null,
        status: grant.status === 'closed' ? 'closed' : 'posted',
        open_date: null,
        close_date: null,
        award_floor: null,
        award_ceiling: parseAmount(grant.amount),
        eligibility_codes: [],
        funding_categories: [],
        description: grant.description,
        announcement_url: grant.applyUrl,
        applicant_eligibility_desc: grant.eligibilityNotes,
        agency_contact_name: null,
        agency_contact_email: null,
        agency_contact_phone: null,
        raw_detail: grant,
        synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      imported++;
    } catch (err) {
      errors.push(`${grant.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.status(200).json({ ok: true, imported, errorCount: errors.length, errors: errors.slice(0, 10) });
}
