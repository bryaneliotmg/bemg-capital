import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { classifyUnclassifiedOpportunities } from './_lib/domainTaxonomy.js';

// Backfill for opportunities synced before domain classification existed (going
// forward, every sync source classifies new rows itself — see grantsSync.ts,
// sbaGov.ts, import-grants.ts). Runs daily via vercel.json's cron entry, trickling
// through the historical backlog a few items at a time — the free-tier Gemini key
// caps out at 20 classifications/day total, so this can't just run once and finish;
// it's also safe to call manually any time (e.g. ?limit=N) since each call only pulls
// whatever's still unclassified.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  // 4 and 3 both timed out before the real cause was found: withRetry was waiting out
  // the API's suggested ~60s retryDelay on a daily-quota 429 (not the per-minute one),
  // which alone exceeds this function's 60s ceiling. Now that classifyUnclassifiedOpportunities
  // fails fast on a daily-quota error instead of waiting on it, 4 is safe again — each
  // successful call is paced 13s apart (per-minute quota) and a daily-quota exhaustion
  // mid-batch stops the loop immediately rather than stacking a 60s wait.
  const limit = req.query.limit ? Number(req.query.limit) : 4;
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
