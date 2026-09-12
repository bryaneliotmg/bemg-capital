import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { classifyUnclassifiedOpportunities } from './_lib/domainTaxonomy.js';
import { rankByTenantRelevance } from './_lib/relevanceRanking.js';

// Backfill for opportunities synced before domain classification existed (going
// forward, every sync source classifies new rows itself — see grantsSync.ts,
// sbaGov.ts, import-grants.ts). Runs once daily via vercel.json's cron entry — Vercel's
// Hobby plan (this project's tier) only allows a cron to run once/day, so spreading
// this across several smaller runs isn't available without upgrading. Also safe to
// call manually any time (e.g. ?limit=N) since each call only pulls whatever's still
// unclassified.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  // A prior key got suspended (CONSUMER_SUSPENDED) after a burst of ~25 requests fired
  // back-to-back with no pacing, right when billing was first linked — a classic
  // fraud-detection trigger on a brand-new billing account. Since Hobby's once/day
  // cron limit means this can't be spread across multiple smaller daily runs, the
  // actual safety fix is classifyUnclassifiedOpportunities()'s 1s pacing between calls
  // (see its comment) — a 30-item run now takes at least ~30s of steady, evenly-spaced
  // requests instead of an instant spike. 30 is a deliberate, modest step up from the
  // old free-tier 20/day ceiling, not a dramatic jump, while that pacing is still new.
  const limit = req.query.limit ? Number(req.query.limit) : 30;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Pull the whole outstanding pool (bounded generously — the current backlog is
  // ~230), then rank it by how relevant each grant already looks to real tenants
  // before picking which handful gets today's limited AI calls. Without this, the
  // backlog would clear in whatever order it happened to be inserted — no reason
  // that order would line up with what tenants are actually looking at right now.
  //
  // description IS NOT NULL excludes freshly-synced Grants.gov "shell" rows (see
  // syncOpportunityShells() in grantsSync.ts) that only have a title so far, not real
  // content yet — classifying those now would waste a precious daily Gemini call on
  // title-only text and then never revisit it once enrichOpportunityDetails() fills in
  // the actual description days later. Only grants_gov rows can have a null
  // description (every other source sets it at insert time), so this doesn't affect them.
  const { data: candidateRows, error } = await supabase
    .from('funding_opportunities')
    .select('id')
    .or('primary_domain.is.null,eligible_states.is.null')
    .not('description', 'is', null)
    .limit(500);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const candidateIds = (candidateRows ?? []).map((r) => r.id);
  const ranked = await rankByTenantRelevance(supabase, candidateIds);
  const ids = ranked.slice(0, limit);
  const result = await classifyUnclassifiedOpportunities(supabase, ids);

  const { count: remaining } = await supabase
    .from('funding_opportunities')
    .select('id', { count: 'exact', head: true })
    .or('primary_domain.is.null,eligible_states.is.null')
    .not('description', 'is', null);

  res.status(200).json({ ok: true, attempted: ids.length, ...result, remaining });
}
