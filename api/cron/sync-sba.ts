import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncSbaGov } from '../_lib/sources/sbaGov.js';

// Confirmed working with a plain fetch (no bot-blocking, unlike Hello Alice/MBDA —
// see the removed sync-hello-alice.ts for why that one needed a headless browser and
// still didn't work). SBA.gov's Grants page is a fairly static, curated list of named
// programs rather than a live dated-deadline feed, so this runs monthly, not daily.
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
    const result = await syncSbaGov();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
