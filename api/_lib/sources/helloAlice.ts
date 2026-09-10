import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { fetchRenderedPage } from '../browserFetch.js';

const OPPORTUNITIES_URL = 'https://www.helloalice.com/opportunities';

interface ExtractedGrant {
  title: string;
  amount: string | null;
  statusLabel: string;
  description: string;
  applyUrl: string | null;
}

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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function extractGrants(bodyText: string, links: { text: string; href: string }[]): Promise<ExtractedGrant[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');

  const linksBlock = links.map((l) => `"${l.text}" -> ${l.href}`).join('\n');

  const prompt = `Below is the rendered text of Hello Alice's public "Opportunities" page (helloalice.com/opportunities), which lists grants, accelerators, partner offers, and events for small businesses, followed by every link on the page.

Extract ONLY the items explicitly labeled "GRANT" (skip OFFER, EVENT, and ACCELERATOR entirely — this is for a grant-matching database, not a general opportunities feed). For each grant, return:
- "title": the grant's name, exactly as written
- "amount": the dollar amount if one is stated (e.g. "$50,000"), otherwise null — do not invent a number
- "statusLabel": the status badge shown near it (e.g. "ACCEPTING APPLICATIONS", "ONGOING", "CLOSED")
- "description": the grant's description text, verbatim
- "applyUrl": look through the links list below and find the href whose link text (e.g. "APPLY NOW →") appears immediately after this grant's description in the page text — use that href. If you can't confidently match one, use null. Never invent a URL.

PAGE TEXT:
${bodyText.slice(0, 15000)}

LINKS ON THE PAGE:
${linksBlock.slice(0, 8000)}

Return JSON: { "grants": [ ... ] }`;

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
            grants: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  amount: { type: Type.STRING, nullable: true },
                  statusLabel: { type: Type.STRING },
                  description: { type: Type.STRING },
                  applyUrl: { type: Type.STRING, nullable: true },
                },
                required: ['title', 'statusLabel', 'description'],
              },
            },
          },
          required: ['grants'],
        },
      },
    }),
  );

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(clean) as { grants: ExtractedGrant[] };
  return parsed.grants ?? [];
}

function parseAmount(amount: string | null): number | null {
  if (!amount) return null;
  const num = Number(amount.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

export interface HelloAliceSyncResult {
  found: number;
  synced: number;
  errorCount: number;
  errors: string[];
}

/**
 * Syncs Hello Alice's public grant listings (helloalice.com/opportunities) into
 * funding_opportunities. Unlike Grants.gov, this isn't a documented API — it's a
 * real rendered web page, extracted via a headless browser + Gemini rather than
 * hand-written CSS selectors (the exact page markup isn't something we control or
 * can rely on staying stable, but the visible text structure is what Gemini reads).
 *
 * Every listing here is inherently small-business-facing (that's the entire premise
 * of the site), so unlike Grants.gov there's no applicant-type facet to check —
 * matchOpportunity() treats source !== 'grants_gov' as passing the hard eligibility
 * filter automatically. See src/lib/matching.ts.
 */
export async function syncHelloAlice(): Promise<HelloAliceSyncResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { bodyText, links } = await fetchRenderedPage(OPPORTUNITIES_URL);
  const grants = await extractGrants(bodyText, links);

  let synced = 0;
  const errors: string[] = [];

  for (const grant of grants) {
    try {
      const isOpen = !/closed/i.test(grant.statusLabel);
      const { error } = await supabase.from('funding_opportunities').upsert({
        id: `hello_alice:${slugify(grant.title)}`,
        source: 'hello_alice',
        opportunity_number: null,
        title: grant.title,
        agency_name: 'Hello Alice (partner-funded)',
        agency_code: null,
        cfda_list: [],
        doc_type: null,
        status: isOpen ? 'posted' : 'closed',
        open_date: null,
        close_date: null,
        award_floor: null,
        award_ceiling: parseAmount(grant.amount),
        eligibility_codes: [],
        funding_categories: [],
        description: grant.description,
        announcement_url: grant.applyUrl || OPPORTUNITIES_URL,
        applicant_eligibility_desc: 'Open to small businesses via Hello Alice — see the listing for specific program criteria.',
        agency_contact_name: null,
        agency_contact_email: null,
        agency_contact_phone: null,
        raw_detail: grant,
        synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      synced++;
    } catch (err) {
      errors.push(`${grant.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { found: grants.length, synced, errorCount: errors.length, errors: errors.slice(0, 10) };
}
