import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncGrants } from './_lib/grantsSync.js';

// User-triggered search (as opposed to the scheduled cron sync): looks up
// Grants.gov live by keyword, right now, and caches whatever it finds into
// funding_opportunities so the result is available to the normal matching
// pipeline immediately and on future visits. Proxied server-side (not called
// directly from the browser) both to avoid CORS on api.grants.gov and to
// keep the Supabase service-role key off the client.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!keyword) {
    res.status(400).json({ error: 'Missing required query param: q' });
    return;
  }

  try {
    const result = await syncGrants({ keyword, rows: 20 });
    res.status(200).json({ ok: true, keyword, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' });
  }
}
