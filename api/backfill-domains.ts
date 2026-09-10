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

  const limit = req.query.limit ? Number(req.query.limit) : 50;
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
  const result = await classifyUnclassifiedOpportunities(supabase, ids, 10);

  const { count: remaining } = await supabase
    .from('funding_opportunities')
    .select('id', { count: 'exact', head: true })
    .is('primary_domain', null);

  res.status(200).json({ ok: true, attempted: ids.length, ...result, remaining });
}
