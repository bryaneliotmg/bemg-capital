import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncOpportunityShells, enrichOpportunityDetails } from '../_lib/grantsSync.js';

// Two phases, both fast enough to run in the same invocation:
// 1. syncOpportunityShells() — one or two Grants.gov search calls covering the FULL
//    current catalog (~1,430 open/forecasted business-eligible opportunities today),
//    not just a small `rows` slice. This used to be `syncGrants({ rows: 25 })`, which
//    only ever saw the top 25 of ~1,430 per day — a user searching Grants.gov directly
//    found real, relevant opportunities this app had simply never synced.
// 2. enrichOpportunityDetails() — bounded trickle that fills in description/award/
//    eligibility for shell rows synced by phase 1 but not yet detail-fetched.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const shellResult = await syncOpportunityShells();
    const enrichResult = await enrichOpportunityDetails();
    res.status(200).json({ ok: true, shells: shellResult, enrichment: enrichResult });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
