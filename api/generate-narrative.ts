import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

interface SectionDef {
  id: string;
  label: string;
  guidance: string;
  prompt: string;
}

interface BusinessFact {
  label: string;
  value: string;
  status: 'verified' | 'inferred' | 'required';
}

interface ReferenceAbstract {
  title: string;
  abstract: string;
}

interface GenerateBody {
  sections: SectionDef[];
  opportunity: { title: string; funder: string; amount: string; description: string; eligibilityNotes?: string | null };
  businessFacts: BusinessFact[];
  referenceAbstracts?: ReferenceAbstract[];
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    return;
  }

  const body = req.body as GenerateBody;
  if (!body?.sections?.length || !body?.opportunity) {
    res.status(400).json({ error: 'Missing required fields: sections, opportunity' });
    return;
  }

  const factLines = body.businessFacts
    .map((f) => {
      const statusLabel =
        f.status === 'required' ? 'REQUIRED INPUT — NOT YET PROVIDED' : f.status === 'inferred' ? 'Inferred' : 'Verified';
      return `- ${f.label}: ${f.value} [${statusLabel}]`;
    })
    .join('\n');

  const referenceBlock = (body.referenceAbstracts ?? [])
    .slice(0, 8)
    .map((r, i) => `Reference ${i + 1} — "${r.title}":\n${r.abstract.slice(0, 1200)}`)
    .join('\n\n');

  const sectionsBlock = body.sections
    .map((s) => `### ${s.id} — "${s.label}"\nWhat reviewers score: ${s.guidance}\nAnswer this: ${s.prompt}`)
    .join('\n\n');

  const prompt = `You are drafting sections of a real federal/foundation grant application narrative for a small business, to be reviewed and edited by the business owner before submission — this is a first draft, not a final document.

BUSINESS FACTS — this is the ONLY source of truth about the applicant. Do not invent, assume, or embellish any name, number, date, statistic, or achievement not listed here. Every fact is labeled with its confidence:
${factLines || '(no facts provided)'}

RULE: if a fact needed for a section is marked "REQUIRED INPUT — NOT YET PROVIDED" or simply isn't listed above, do NOT invent a plausible-sounding value. Instead write a clear bracketed placeholder in its place, e.g. "[Add specific revenue figures once available]" or "[Name of authorized representative]". Never fabricate a number, name, or claim.

THE OPPORTUNITY being applied to:
Title: ${body.opportunity.title}
Funder: ${body.opportunity.funder}
Amount: ${body.opportunity.amount}
Description: ${body.opportunity.description.slice(0, 2000)}
${body.opportunity.eligibilityNotes ? `Eligibility notes: ${body.opportunity.eligibilityNotes.slice(0, 500)}` : ''}

${
  referenceBlock
    ? `REAL FUNDED EXAMPLES from past awards under the same mechanism — for STRUCTURE AND TONE REFERENCE ONLY. These describe different, unrelated projects. Do NOT copy, reuse, or adapt any specific fact, number, technical claim, or result from them into the applicant's narrative — use them only to calibrate the level of formality, technical depth, and organization typical for this program.\n\n${referenceBlock}\n`
    : ''
}
Write a first draft for each of the following narrative sections. Each should be 2-4 focused paragraphs (shorter for Timeline/Budget, which may use short lines) written in the applicant's voice (first person plural, "we"), grounded strictly in the business facts above:

${sectionsBlock}

Return your answer as JSON with one field per section id listed above (use the exact id strings), each containing that section's drafted text as a plain string (no markdown headers inside the text).`;

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.replace(/[^\x20-\x7E]/g, '') });
    const properties: Record<string, { type: typeof Type.STRING }> = {};
    for (const s of body.sections) properties[s.id] = { type: Type.STRING };

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties,
            required: body.sections.map((s) => s.id),
          },
        },
      }),
    );

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
    const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const sections = JSON.parse(clean);

    res.status(200).json({ ok: true, sections });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' });
  }
}
