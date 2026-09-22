import type { VercelRequest, VercelResponse } from '@vercel/node';
import { classifySearchQuery } from './_lib/domainTaxonomy.js';

interface FreeTextSearchBody {
  description: string;
}

// Turns a user's free-text description of the grant they want (the "Describe the grant
// you're looking for" box on the Grant Matches page) into the same structured signal
// shape BusinessProfile expects, via one Gemini call (see classifySearchQuery in
// _lib/domainTaxonomy.ts). The client then runs the existing deterministic
// matchOpportunity() scoring (src/lib/matching.ts) against that profile itself, the same
// way it already does for a tenant's Business DNA profile — this endpoint only extracts
// structure from what the user typed, it never scores or picks grants itself.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body as FreeTextSearchBody;
  const description = body?.description?.trim();
  if (!description) {
    res.status(400).json({ error: 'Expected { description }' });
    return;
  }

  try {
    const result = await classifySearchQuery(description);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' });
  }
}
