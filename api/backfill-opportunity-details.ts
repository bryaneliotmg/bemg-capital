import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enrichOpportunityDetails } from './_lib/grantsSync.js';

// Manual trigger for enrichOpportunityDetails() (see grantsSync.ts) — same shape as
// backfill-domains.ts. Runs automatically as part of the daily sync-grants cron too;
// this exists so the detail backlog (currently ~1,180 shell rows synced by
// syncOpportunityShells() but not yet detail-fetched) can be worked down faster than
// once/day if needed, by calling this repeatedly with a larger ?limit=.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  try {
    const result = await enrichOpportunityDetails(limit);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Enrichment failed' });
  }
}
