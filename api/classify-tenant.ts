import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { classifyTenantDomain } from './_lib/domainTaxonomy.js';

interface ClassifyBody {
  tenantId: string;
  profileText: string;
}

// Called from OpportunitiesContext whenever a tenant's Business DNA profile text has
// changed since it was last classified (compared by exact text match against the
// stored profile_fingerprint) — never on every page load. This is the one place a
// domain classification AI call happens outside a grant sync; match time itself
// (matchOpportunity() in src/lib/matching.ts) only ever reads the already-stored
// result, no live calls.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  const body = req.body as ClassifyBody;
  if (!body?.tenantId || !body?.profileText?.trim()) {
    res.status(400).json({ error: 'Expected { tenantId, profileText }' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: existing } = await supabase
    .from('tenant_domain_classification')
    .select('profile_fingerprint')
    .eq('tenant_id', body.tenantId)
    .maybeSingle();

  if (existing?.profile_fingerprint === body.profileText) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  try {
    const { primaryDomain, topicTags } = await classifyTenantDomain(body.profileText);
    const { error } = await supabase.from('tenant_domain_classification').upsert({
      tenant_id: body.tenantId,
      primary_domain: primaryDomain,
      topic_tags: topicTags,
      profile_fingerprint: body.profileText,
      classified_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.status(200).json({ ok: true, skipped: false, primaryDomain, topicTags });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Classification failed' });
  }
}
