import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

interface SectionDef {
  id: string;
  label: string;
  guidance: string;
}

interface AssessBody {
  sections: SectionDef[];
  narrative: Record<string, string>;
  opportunity: { title: string; funder: string; description: string; eligibilityNotes?: string | null };
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

// Anything this short or entirely made of bracketed placeholders isn't real content —
// skip the (costly, pointless) AI call and score it as unaddressed directly.
function isSubstantive(text: string): boolean {
  const stripped = text.replace(/\[[^\]]+\]/g, '').trim();
  return stripped.length >= 40;
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

  const body = req.body as AssessBody;
  if (!body?.sections?.length || !body?.opportunity) {
    res.status(400).json({ error: 'Missing required fields: sections, opportunity' });
    return;
  }

  const results: Record<string, { rating: string; score: number; reason: string }> = {};
  const toAssess = body.sections.filter((s) => isSubstantive(body.narrative[s.id] ?? ''));
  const skipped = body.sections.filter((s) => !isSubstantive(body.narrative[s.id] ?? ''));

  for (const s of skipped) {
    results[s.id] = {
      rating: 'Not Addressed',
      score: 0,
      reason: 'This section is empty or still just a placeholder skeleton — nothing here for a reviewer to score yet.',
    };
  }

  if (toAssess.length === 0) {
    res.status(200).json({ ok: true, assessments: results });
    return;
  }

  const sectionsBlock = toAssess
    .map(
      (s) =>
        `### ${s.id} — "${s.label}"\nWhat this criterion asks for: ${s.guidance}\nWritten text:\n${(body.narrative[s.id] ?? '').slice(0, 3000)}`,
    )
    .join('\n\n');

  const prompt = `You are a strict, experienced federal/foundation grant reviewer scoring a draft application against the SPECIFIC review criteria this program actually uses. You are not evaluating whether the underlying business is impressive in the abstract, and you are not estimating the odds this application gets funded — funding decisions depend on the competing applicant pool and available program funds, which you cannot see. Judge ONLY whether the WRITTEN TEXT below substantively and credibly addresses what its criterion asks for.

Be strict, not encouraging: competitive grant review is unforgiving of vague, generic, or thin writing even when it's grammatically fine and well-organized. A section that restates the prompt without concrete specifics, evidence, or a real plan should score low regardless of tone.

THE OPPORTUNITY:
Title: ${body.opportunity.title}
Funder: ${body.opportunity.funder}
Description: ${body.opportunity.description.slice(0, 1500)}
${body.opportunity.eligibilityNotes ? `Eligibility notes: ${body.opportunity.eligibilityNotes.slice(0, 400)}` : ''}

SECTIONS TO ASSESS:

${sectionsBlock}

For each section id above, return:
- "rating": one of "Strong", "Adequate", "Weak", or "Not Addressed"
- "score": an integer 0-100 for how well the written text addresses that specific criterion (0 = doesn't address it at all, 100 = addresses it thoroughly and concretely)
- "reason": one concise sentence citing something specific from the text (or its absence) — never a generic compliment or vague hedge

Return JSON with one field per section id listed above (use the exact id strings).`;

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.replace(/[^\x20-\x7E]/g, '') });
    const sectionSchema = {
      type: Type.OBJECT,
      properties: {
        rating: { type: Type.STRING },
        score: { type: Type.NUMBER },
        reason: { type: Type.STRING },
      },
      required: ['rating', 'score', 'reason'],
    };
    const properties: Record<string, typeof sectionSchema> = {};
    for (const s of toAssess) properties[s.id] = sectionSchema;

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties,
            required: toAssess.map((s) => s.id),
          },
        },
      }),
    );

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? response.text ?? '';
    const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(clean);

    res.status(200).json({ ok: true, assessments: { ...results, ...parsed } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Assessment failed' });
  }
}
