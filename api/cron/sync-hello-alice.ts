import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncHelloAlice } from '../_lib/sources/helloAlice.js';

// KNOWN NOT WORKING as of 2026-09 — kept in place pending a decision on how (or
// whether) to proceed. A plain fetch() to helloalice.com 403's (basic bot filtering
// on request headers); a real headless browser with a realistic user agent got past
// that layer during local development, but from Vercel's own serverless IPs it hits
// "Vercel Security Checkpoint" — Vercel's own bot-detection product, evidently
// running on Hello Alice's (also Vercel-hosted) side, actively fingerprinting this
// as automated ("Failed to verify your browser — Code 21") rather than just being
// slow to pass. Confirmed via direct testing (including a 12s wait) that this is a
// hard rejection, not a timing issue. Every real run currently returns found:0 — see
// api/_lib/browserFetch.ts and api/_lib/sources/helloAlice.ts for the pipeline this
// would need a stealth-patched browser or a commercial anti-detect browser API to
// actually clear.
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
    const result = await syncHelloAlice();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
