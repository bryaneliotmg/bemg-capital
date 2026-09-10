import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { classifyUnclassifiedOpportunities } from '../domainTaxonomy.js';

const GRANTS_PAGE_URL = 'https://www.sba.gov/funding-programs/grants';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface ExtractedProgram {
  title: string;
  description: string;
  amount: string | null;
  applyUrl: string | null;
  eligibilityNotes: string | null;
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

function parseAmount(amount: string | null): number | null {
  if (!amount) return null;
  const num = Number(amount.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

// Strips scripts/styles/tags down to readable text — SBA.gov's grants page is a long
// WordPress page (headings, accordions, nav chrome), not a short synopsis, so this is
// more aggressive than opportunities.ts's stripHtml (which only ever handles a single
// Grants.gov paragraph).
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function extractPrograms(pageText: string): Promise<ExtractedProgram[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');

  const prompt = `Below is the text of SBA.gov's public "Grants" page, which describes SBA-affiliated funding and grant programs for small businesses (manufacturing, R&D, exporting, community organizations, veteran programs, etc.).

Extract every distinct named GRANT or FUNDING program described (skip pure navigation chrome, generic "what you need to know" advice sections, and search-box UI). For each, return:
- "title": the program's name, exactly as written
- "description": what it does / who it's for, based only on the text given — 1-3 sentences
- "amount": a dollar figure if one is stated, otherwise null — never invent a number
- "applyUrl": a URL if one is explicitly given in the text near this program, otherwise null
- "eligibilityNotes": who's eligible, if stated (e.g. "veteran-owned businesses", "manufacturers"), otherwise null

PAGE TEXT:
${pageText.slice(0, 20000)}

Return JSON: { "programs": [ ... ] }`;

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
            programs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.STRING, nullable: true },
                  applyUrl: { type: Type.STRING, nullable: true },
                  eligibilityNotes: { type: Type.STRING, nullable: true },
                },
                required: ['title', 'description'],
              },
            },
          },
          required: ['programs'],
        },
      },
    }),
  );

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(clean) as { programs: ExtractedProgram[] };
  return parsed.programs ?? [];
}

export interface SbaSyncResult {
  found: number;
  synced: number;
  errorCount: number;
  errors: string[];
}

/**
 * Syncs SBA.gov's public Grants page into funding_opportunities. Unlike Hello Alice,
 * a plain fetch() works here (confirmed via direct testing — no bot-blocking), so no
 * headless browser is needed. Content here is a fairly static, curated list of named
 * SBA-affiliated programs (not a live dated-deadline feed like Grants.gov), so this
 * doesn't need to run often — it's registered on a monthly schedule.
 */
export async function syncSbaGov(): Promise<SbaSyncResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const pageRes = await fetch(GRANTS_PAGE_URL, { headers: { 'User-Agent': DESKTOP_UA }, redirect: 'follow' });
  if (!pageRes.ok) throw new Error(`SBA.gov fetch failed: HTTP ${pageRes.status}`);
  const html = await pageRes.text();
  const pageText = htmlToText(html);

  const programs = await extractPrograms(pageText);

  let synced = 0;
  const errors: string[] = [];
  const syncedIds: string[] = [];

  for (const program of programs) {
    const id = `sba_gov:${slugify(program.title)}`;
    try {
      const { error } = await supabase.from('funding_opportunities').upsert({
        id,
        source: 'sba_gov',
        opportunity_number: null,
        title: program.title,
        agency_name: 'U.S. Small Business Administration',
        agency_code: null,
        cfda_list: [],
        doc_type: null,
        status: 'posted',
        open_date: null,
        close_date: null,
        award_floor: null,
        award_ceiling: parseAmount(program.amount),
        eligibility_codes: [],
        funding_categories: [],
        description: program.description,
        announcement_url: program.applyUrl || GRANTS_PAGE_URL,
        applicant_eligibility_desc: program.eligibilityNotes,
        agency_contact_name: null,
        agency_contact_email: null,
        agency_contact_phone: null,
        raw_detail: program,
        synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      synced++;
      syncedIds.push(id);
    } catch (err) {
      errors.push(`${program.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await classifyUnclassifiedOpportunities(supabase, syncedIds);

  return { found: programs.length, synced, errorCount: errors.length, errors: errors.slice(0, 10) };
}
