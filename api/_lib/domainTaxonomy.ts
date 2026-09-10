import { GoogleGenAI, Type } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';

// A fixed, closed taxonomy — not free-text — so a grant's domain and a tenant's domain
// can be compared with an exact string match, not fuzzy/synonym matching (which would
// just reintroduce the same false-positive risk keyword overlap already has). Picked to
// cover the real breadth this app has actually seen across tenants (marketing/tech,
// arts/youth education, health/wellness) and grant sources (Grants.gov's federal mix,
// SBA.gov, Hello Alice's private small-business grants) — not an exhaustive taxonomy of
// every possible field, just enough to catch genuine mismatches like arts vs. astrophysics.
export const DOMAIN_TAXONOMY = [
  'Science & Technology R&D',
  'Arts & Culture',
  'Small Business & Economic Development',
  'Health & Wellness',
  'Community & Social Services',
  'Education & Workforce Development',
  'Agriculture & Rural Development',
  'Environment & Natural Resources',
  'International & Diplomatic Affairs',
  'Housing & Urban Development',
  'Manufacturing & Industry',
  'Nonprofit Capacity Building',
  'Veterans & Military Services',
  'Public Safety & Emergency Management',
  'Other / General Business Support',
] as const;

export type Domain = (typeof DOMAIN_TAXONOMY)[number];

// "Other / General Business Support" is a deliberate escape hatch, not a real domain to
// penalize against — it's for genuinely broad small-business programs (many Hello Alice/
// SBA listings) that don't have one specific field. Treated as a wildcard: never counted
// as a mismatch against anything.
export const WILDCARD_DOMAIN: Domain = 'Other / General Business Support';

// The Gemini key on this project is free-tier, hard-limited to 5 requests/minute for
// gemini-2.5-flash — discovered via a real backfill run that failed on 47/50 items
// with RESOURCE_EXHAUSTED, all citing exactly that quota. The API's own error tells
// us how long to actually wait ("retryDelay":"12s" in its JSON body) — use that
// instead of guessing, since guessing wrong just wastes another attempt against the
// same 60-second window.
function extractRetryDelayMs(message: string): number | null {
  const match = message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : null;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimited = message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
      const isRetryable = message.includes('503') || message.includes('UNAVAILABLE') || isRateLimited;
      if (attempt < retries && isRetryable) {
        const wait = isRateLimited ? (extractRetryDelayMs(message) ?? 13000) : delayMs * (attempt + 1);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export interface DomainClassification {
  primaryDomain: Domain;
  topicTags: string[];
}

async function classify(subjectLabel: string, text: string): Promise<DomainClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');

  const prompt = `Classify the actual subject matter of the following ${subjectLabel}, based only on the text given.

Pick exactly ONE "primaryDomain" from this fixed list (use the exact string, nothing else):
${DOMAIN_TAXONOMY.map((d) => `- ${d}`).join('\n')}

Pick the domain that best describes what this is REALLY about — not its administrative type (e.g. "it's a grant" isn't a domain) and not generic boilerplate it might mention in passing (eligibility clauses, diversity/outreach language, funding-mechanism details). If it's a broad small-business program without one specific field, use "${WILDCARD_DOMAIN}" rather than forcing a specific-sounding one.

Also return 3-6 short "topicTags" (lowercase, 1-3 words each) that are genuinely central to the subject.

TEXT:
${text.slice(0, 4000)}

Return JSON: { "primaryDomain": "...", "topicTags": ["...", ...] }`;

  const ai = new GoogleGenAI({ apiKey: apiKey.replace(/[^\x20-\x7E]/g, '') });
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primaryDomain: { type: Type.STRING, enum: [...DOMAIN_TAXONOMY] },
            topicTags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['primaryDomain', 'topicTags'],
        },
      },
    }),
  );

  const text_ = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
  const clean = text_.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(clean) as { primaryDomain: string; topicTags: string[] };

  const primaryDomain = (DOMAIN_TAXONOMY as readonly string[]).includes(parsed.primaryDomain)
    ? (parsed.primaryDomain as Domain)
    : WILDCARD_DOMAIN;

  return { primaryDomain, topicTags: parsed.topicTags ?? [] };
}

/** Classifies a grant/opportunity's real subject — called once per opportunity, at
 * ingest time (see grantsSync.ts, sbaGov.ts, import-grants.ts), never at match time. */
export async function classifyGrantDomain(title: string, description: string): Promise<DomainClassification> {
  return classify('grant/funding opportunity', `${title}\n\n${description}`);
}

/** Classifies a tenant's business — called only when their Business DNA profile text
 * has meaningfully changed (see profile_fingerprint in tenant_domain_classification),
 * not on every page load. */
export async function classifyTenantDomain(profileText: string): Promise<DomainClassification> {
  return classify('small business', profileText);
}

/**
 * Classifies whichever of the given opportunity IDs don't have a domain yet — called
 * after every sync (Grants.gov, SBA.gov, manual import) so each grant gets classified
 * exactly once, ever, regardless of how many times it's re-synced afterward (a plain
 * upsert that omits primary_domain/topic_tags leaves an existing classification
 * untouched, so re-syncing the same grant tomorrow doesn't reclassify it today's work).
 *
 * Strictly sequential with a fixed pause between calls, not concurrent — the Gemini key
 * on this project is free-tier, hard-limited to 5 requests/minute for gemini-2.5-flash
 * (found via a real backfill run that failed on 47/50 items with RESOURCE_EXHAUSTED).
 * That's a per-project ceiling, not a per-worker one, so running several calls at once
 * just fails most of them instead of actually finishing faster — pacing every call
 * ~13s apart (60s / 5 + a small margin) stays under the limit instead of hitting it and
 * retrying. This means a serverless function's ~60s budget only fits ~4 classifications
 * per invocation; any individual failure is swallowed so it doesn't fail the whole
 * sync — it just stays unclassified until the next sync or backfill call picks it up.
 */
export async function classifyUnclassifiedOpportunities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ids: string[],
): Promise<{ classified: number; errorCount: number; errors: string[] }> {
  if (ids.length === 0) return { classified: 0, errorCount: 0, errors: [] };

  const { data: unclassified, error } = await supabase
    .from('funding_opportunities')
    .select('id, title, description')
    .in('id', ids)
    .is('primary_domain', null);
  if (error || !unclassified) return { classified: 0, errorCount: 0, errors: [error?.message ?? 'no data'] };

  let classified = 0;
  const errors: string[] = [];

  for (let i = 0; i < unclassified.length; i++) {
    const opp = unclassified[i];
    try {
      const { primaryDomain, topicTags } = await classifyGrantDomain(opp.title, opp.description ?? '');
      const { error: updateError } = await supabase
        .from('funding_opportunities')
        .update({ primary_domain: primaryDomain, topic_tags: topicTags })
        .eq('id', opp.id);
      if (updateError) throw updateError;
      classified++;
    } catch (err) {
      errors.push(`${opp.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i < unclassified.length - 1) {
      await new Promise((r) => setTimeout(r, 13000));
    }
  }

  return { classified, errorCount: errors.length, errors: errors.slice(0, 10) };
}
