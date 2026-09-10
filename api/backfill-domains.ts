import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { classifyUnclassifiedOpportunities } from './_lib/domainTaxonomy.js';

// One-off, manually-triggered backfill for opportunities synced before domain
// classification existed (going forward, every sync source classifies new rows
// itself — see grantsSync.ts, sbaGov.ts, import-grants.ts). Safe to call repeatedly:
// each call only pulls whatever's still unclassified, in a bounded batch, so it can
// just be re-run until nothing's left rather than needing to finish in one request.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  // Classification is strictly sequential with a ~13s pause between calls (see
  // classifyUnclassifiedOpportunities's own comment — the Gemini key here is
  // free-tier, 5 requests/minute). A limit of 4 actually timed out in practice
  // (3 gaps × 13s = 39s, plus 4 real Gemini calls whose latency varies, plus the
  // two Supabase queries either side, exceeded the 60s function ceiling) — 3 leaves
  // real margin (2 gaps × 13s = 26s) instead of cutting it exactly close.
  const limit = req.query.limit ? Number(req.query.limit) : 3;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: rows, error } = await supabase
    .from('funding_opportunities')
    .select('id')
    .is('primary_domain', null)
    .limit(limit);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const ids = (rows ?? []).map((r) => r.id);
  const result = await classifyUnclassifiedOpportunities(supabase, ids);

  const { count: remaining } = await supabase
    .from('funding_opportunities')
    .select('id', { count: 'exact', head: true })
    .is('primary_domain', null);

  res.status(200).json({ ok: true, attempted: ids.length, ...result, remaining });
}
