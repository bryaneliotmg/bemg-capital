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

// USPS state/territory codes — used to validate whatever the LLM returns for a grant's
// geographic restriction (see classify()'s geography pass below) rather than trusting
// free-text output. Anything not in this set is dropped, not guessed-and-kept.
export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'GU', 'VI', 'AS', 'MP',
]);

// The Gemini key on this project is free-tier. It turned out to carry TWO separate
// quotas, discovered the hard way across two different backfill failures: a per-minute
// cap (5 req/min — the first failure, 47/50 items RESOURCE_EXHAUSTED) and, underneath
// that, a per-DAY cap of just 20 requests total for gemini-2.5-flash (the second
// failure — same RESOURCE_EXHAUSTED error, but quotaId
// "GenerateRequestsPerDayPerProjectPerModel-FreeTier"). These need different handling:
// a per-minute 429 is worth waiting out (the API's own "retryDelay" is ~13s, comfortably
// inside a 60s function). A per-day 429 is NOT worth waiting out — the API's suggested
// retryDelay for that one is ~60s, which alone blows the function's entire time budget,
// and waiting doesn't help anyway since the quota won't refill until midnight. So a
// daily-quota error must fail fast, not retry.
function isDailyQuotaExhausted(message: string): boolean {
  return message.includes('GenerateRequestsPerDayPerProjectPerModel');
}

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
      if (isDailyQuotaExhausted(message)) throw err; // no point waiting ~60s for a quota that resets at midnight
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
  /** State/territory codes this GRANT is restricted to, e.g. ["WA"] — empty means
   * nationwide/no geographic restriction found. Always [] for a tenant classification
   * (a business isn't "geographically restricted" the way a grant's eligibility can be);
   * only meaningful when returned from classifyGrantDomain. */
  eligibleStates: string[];
}

// Folded into the SAME Gemini call as domain classification, not a second call — the
// free-tier key is capped at 20 requests/day total, so a separate location-only call
// per grant would halve the number of grants classified per day for no reason, since
// the model already reads the full text once anyway.
async function classify(subjectLabel: string, text: string, includeGeography: boolean): Promise<DomainClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');

  const geographyInstructions = includeGeography
    ? `\n\nAlso determine "eligibleStates": a list of two-letter USPS state/territory codes (e.g. "WA", "MS", "DC", "PR") that applicants must be located in to qualify — ONLY if the text explicitly restricts who can apply to specific state(s) or a named region (e.g. "applicants must be located in eastern Washington", "open to small businesses in the Pacific Northwest", "serving rural Mississippi communities"). Return an EMPTY array if the program is open nationwide, if no geographic restriction is stated, or if a place name only appears as the funding agency's own office address (e.g. a federal agency headquartered in Washington, DC does not make its nationwide grants DC-only) — an empty array is the correct, common answer; do not guess a restriction that isn't clearly stated.`
    : '';

  const prompt = `Classify the actual subject matter of the following ${subjectLabel}, based only on the text given.

Pick exactly ONE "primaryDomain" from this fixed list (use the exact string, nothing else):
${DOMAIN_TAXONOMY.map((d) => `- ${d}`).join('\n')}

Pick the domain that best describes what this is REALLY about — not its administrative type (e.g. "it's a grant" isn't a domain) and not generic boilerplate it might mention in passing (eligibility clauses, diversity/outreach language, funding-mechanism details). If it's a broad small-business program without one specific field, use "${WILDCARD_DOMAIN}" rather than forcing a specific-sounding one.

Also return 3-6 short "topicTags" (lowercase, 1-3 words each) that are genuinely central to the subject.${geographyInstructions}

TEXT:
${text.slice(0, 4000)}

Return JSON: { "primaryDomain": "...", "topicTags": ["...", ...]${includeGeography ? ', "eligibleStates": ["..."]' : ''} }`;

  const properties: Record<string, unknown> = {
    primaryDomain: { type: Type.STRING, enum: [...DOMAIN_TAXONOMY] },
    topicTags: { type: Type.ARRAY, items: { type: Type.STRING } },
  };
  const required = ['primaryDomain', 'topicTags'];
  if (includeGeography) {
    properties.eligibleStates = { type: Type.ARRAY, items: { type: Type.STRING } };
    required.push('eligibleStates');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.replace(/[^\x20-\x7E]/g, '') });
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties, required },
      },
    }),
  );

  const text_ = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
  const clean = text_.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(clean) as { primaryDomain: string; topicTags: string[]; eligibleStates?: string[] };

  const primaryDomain = (DOMAIN_TAXONOMY as readonly string[]).includes(parsed.primaryDomain)
    ? (parsed.primaryDomain as Domain)
    : WILDCARD_DOMAIN;

  const eligibleStates = (parsed.eligibleStates ?? [])
    .map((s) => s.toUpperCase().trim())
    .filter((s) => US_STATE_CODES.has(s));

  return { primaryDomain, topicTags: parsed.topicTags ?? [], eligibleStates };
}

/** Classifies a grant/opportunity's real subject AND, in the same call, whether it's
 * geographically restricted — called once per opportunity, at ingest time (see
 * grantsSync.ts, sbaGov.ts, import-grants.ts), never at match time. Real case that
 * surfaced the geography gap: a Spokane, WA-specific program showing up as a top match
 * for a Mississippi-based tenant, because keyword/domain matching alone has no concept
 * of "who is this actually open to, geographically." */
export async function classifyGrantDomain(title: string, description: string): Promise<DomainClassification> {
  return classify('grant/funding opportunity', `${title}\n\n${description}`, true);
}

/** Classifies a tenant's business — called only when their Business DNA profile text
 * has meaningfully changed (see profile_fingerprint in tenant_domain_classification),
 * not on every page load. No geography pass here — the tenant's own state comes
 * straight from their Business DNA "Headquarters City" field (see src/lib/location.ts),
 * which is more reliable than asking the model to infer it from prose. */
export async function classifyTenantDomain(profileText: string): Promise<DomainClassification> {
  return classify('small business', profileText, false);
}

/**
 * Classifies whichever of the given opportunity IDs don't have a domain yet — called
 * after every sync (Grants.gov, SBA.gov, manual import) so each grant gets classified
 * exactly once, ever, regardless of how many times it's re-synced afterward (a plain
 * upsert that omits primary_domain/topic_tags leaves an existing classification
 * untouched, so re-syncing the same grant tomorrow doesn't reclassify it today's work).
 *
 * Strictly sequential, not concurrent — running several calls at once against the same
 * per-project quota just fails most of them instead of finishing faster. Originally
 * this also added a blind 13s sleep between every call to stay under the free tier's
 * 5 req/min ceiling — since billing was enabled on this project's Gemini key, that
 * ceiling (and the 20/day one under it) no longer applies, so the fixed pause was
 * removed. withRetry() (above) already reacts to an actual 429 by waiting out
 * whatever delay the API itself suggests before retrying — that reactive handling is
 * what keeps this safe if a lower-tier limit is ever hit again (say, this project's
 * billing lapses, or a different key is swapped in), without needing to permanently
 * pay a 13s-per-item tax that a paid key no longer needs. isDailyQuotaExhausted()
 * below still exists for the same reason: it costs nothing when it never fires, and
 * still protects a single invocation's time budget if a daily-style cap ever recurs.
 */
export async function classifyUnclassifiedOpportunities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ids: string[],
): Promise<{ classified: number; errorCount: number; errors: string[] }> {
  if (ids.length === 0) return { classified: 0, errorCount: 0, errors: [] };

  // "Needs work" means missing EITHER field, not just primary_domain — a small number
  // of rows were domain-classified before the geography pass existed, so this also
  // catches those and backfills eligible_states for them without re-scanning everything.
  const { data: unclassified, error } = await supabase
    .from('funding_opportunities')
    .select('id, title, description')
    .in('id', ids)
    .or('primary_domain.is.null,eligible_states.is.null');
  if (error || !unclassified) return { classified: 0, errorCount: 0, errors: [error?.message ?? 'no data'] };

  let classified = 0;
  const errors: string[] = [];

  for (let i = 0; i < unclassified.length; i++) {
    const opp = unclassified[i];
    try {
      const { primaryDomain, topicTags, eligibleStates } = await classifyGrantDomain(opp.title, opp.description ?? '');
      const { error: updateError } = await supabase
        .from('funding_opportunities')
        .update({ primary_domain: primaryDomain, topic_tags: topicTags, eligible_states: eligibleStates })
        .eq('id', opp.id);
      if (updateError) throw updateError;
      classified++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${opp.id}: ${message}`);
      // The day's quota is gone for every remaining item too — stop now rather than
      // spend the rest of this invocation's time budget failing the same way repeatedly.
      if (isDailyQuotaExhausted(message)) break;
    }
  }

  return { classified, errorCount: errors.length, errors: errors.slice(0, 10) };
}
