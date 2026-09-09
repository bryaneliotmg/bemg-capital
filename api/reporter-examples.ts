import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractNihActivityCodes, fetchReporterAbstracts } from './_lib/reporter.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const title = typeof req.query.title === 'string' ? req.query.title : '';
  if (!title) {
    res.status(400).json({ error: 'Missing required query param: title' });
    return;
  }

  const activityCodes = extractNihActivityCodes(title);
  if (activityCodes.length === 0) {
    res.status(200).json({ ok: true, activityCodes: [], examples: [] });
    return;
  }

  try {
    const examples = await fetchReporterAbstracts(activityCodes, 8);
    res.status(200).json({ ok: true, activityCodes, examples });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'RePORTER fetch failed' });
  }
}
