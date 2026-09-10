import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncHelloAlice } from '../_lib/sources/helloAlice.js';
import { fetchRenderedPage } from '../_lib/browserFetch.js';

// A plain fetch() to helloalice.com gets a 403 (basic bot filtering on request
// headers) — confirmed via direct testing before this was built. A real headless
// browser (see api/_lib/browserFetch.ts) with a realistic user agent gets through
// fine, no login required to view the public opportunities list. MBDA.gov, by
// contrast, runs an interactive Cloudflare challenge ("Just a moment...") that a
// headless browser alone doesn't clear — that's a meaningfully harder wall and is
// deliberately not being fought right now; Hello Alice's page already has real
// grant listings, including demographic-targeted ones (e.g. women-owned grants)
// that Grants.gov's federal-only data never surfaces.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  // Temporary debug path (?debug=1): reports exactly what the headless browser saw
  // from Vercel's serverless IP, since a plain 403/found:0 doesn't say whether the
  // page was blocked or the extraction itself found nothing.
  if (req.query.debug) {
    try {
      const waitMs = req.query.wait ? Number(req.query.wait) : undefined;
      const { status, bodyText, links } = await fetchRenderedPage(
        'https://www.helloalice.com/opportunities',
        waitMs,
      );
      res.status(200).json({
        status,
        bodyLength: bodyText.length,
        bodySnippet: bodyText.slice(0, 1500),
        linkCount: links.length,
      });
    } catch (err) {
      res.status(500).json({ debugError: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  try {
    const result = await syncHelloAlice();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
}
