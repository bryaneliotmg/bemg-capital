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

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = message.includes('503') || message.includes('UNAVAILABLE');
      if (attempt < retries && isRetryable) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
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
 * Small bounded concurrency, not full parallelism, to stay well within a serverless
 * function's execution time limit; any individual classification failure is swallowed
 * so it doesn't fail the whole sync — it just stays unclassified until next time.
 */
export async function classifyUnclassifiedOpportunities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ids: string[],
  concurrency = 5,
): Promise<{ classified: number; errorCount: number }> {
  if (ids.length === 0) return { classified: 0, errorCount: 0 };

  const { data: unclassified, error } = await supabase
    .from('funding_opportunities')
    .select('id, title, description')
    .in('id', ids)
    .is('primary_domain', null);
  if (error || !unclassified) return { classified: 0, errorCount: 0 };

  let classified = 0;
  let errorCount = 0;
  const queue = [...unclassified];

  async function worker() {
    while (queue.length > 0) {
      const opp = queue.shift();
      if (!opp) return;
      try {
        const { primaryDomain, topicTags } = await classifyGrantDomain(opp.title, opp.description ?? '');
        const { error: updateError } = await supabase
          .from('funding_opportunities')
          .update({ primary_domain: primaryDomain, topic_tags: topicTags })
          .eq('id', opp.id);
        if (updateError) throw updateError;
        classified++;
      } catch {
        errorCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unclassified.length) }, worker));
  return { classified, errorCount };
}
