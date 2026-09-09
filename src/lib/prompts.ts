interface FactLike {
  label: string;
  value: string;
  status: string;
  multiline?: boolean;
}

interface OpportunityLike {
  title: string;
  funder: string;
  description: string;
  eligibilityNotes?: string | null;
}

// Builds a prompt for the user to paste into any AI tool of their choosing — not a call
// this app makes itself. Explicitly tells that external AI to help with PROCESS (where to
// find the real value, what to double-check) rather than inventing plausible-looking data,
// same anti-hallucination stance as the rest of this app's own AI features.
export function buildOrgInfoPrompt(fields: FactLike[], opportunity: OpportunityLike): string {
  const factLines = fields
    .map((f) => {
      const tag = f.status === 'required' ? 'MISSING' : f.status === 'inferred' ? 'unconfirmed — may not be exact' : 'confirmed';
      return `- ${f.label}: ${f.value} [${tag}]`;
    })
    .join('\n');

  const missing = fields.filter((f) => f.status === 'required').map((f) => f.label);
  const unconfirmed = fields.filter((f) => f.status === 'inferred').map((f) => f.label);

  return `I'm filling out the "Organization Info" section of a federal grant application and want help getting it exactly right. Please do NOT invent or guess a specific value for anything below — only tell me where to find the real answer or what to double-check.

MY BUSINESS PROFILE (as currently on file):
${factLines}

THE GRANT I'M APPLYING TO:
Title: ${opportunity.title}
Funder: ${opportunity.funder}
Description: ${opportunity.description.slice(0, 1500)}
${opportunity.eligibilityNotes ? `Eligibility notes: ${opportunity.eligibilityNotes.slice(0, 500)}` : ''}

WHAT I NEED HELP WITH:
${missing.length ? `1. These fields are still missing: ${missing.join(', ')}. For each, tell me exactly where I'd go get it (e.g. which government site, which document I should already have) — not a made-up value.\n` : ''}${unconfirmed.length ? `2. These fields are unconfirmed and may not exactly match my official registration: ${unconfirmed.join(', ')}. Tell me specifically what document I should check them against (e.g. Articles of Organization, my IRS EIN confirmation letter, my SAM.gov registration) so they match exactly — federal forms are strict about exact matches.\n` : ''}3. Flag anything else above that looks like it might not hold up to that level of scrutiny.`;
}

// Same purpose as buildOrgInfoPrompt, but for the general Identity profile rather than
// a specific grant — useful for getting the registration facts right before ever
// applying anywhere, not tied to any one opportunity's context.
//
// Identity mixes two genuinely different kinds of field: registration facts you look
// up somewhere (EIN, UEI, Legal Name...) and the Company Description, which isn't a
// document to go find — it should be drafted directly from the richer facts already
// on file elsewhere (Business Model, Products & Services, Market, etc.), the same
// single-shot "extract from what's given" pattern as the other two prompts, not a
// back-and-forth conversation. `supportingFacts` supplies that raw material.
export function buildIdentityPrompt(identityFields: FactLike[], supportingFacts: FactLike[] = []): string {
  const factLines = identityFields
    .map((f) => {
      const tag = f.status === 'required' ? 'MISSING' : f.status === 'inferred' ? 'unconfirmed — may not be exact' : 'confirmed';
      return `- ${f.label}: ${f.value} [${tag}]`;
    })
    .join('\n');

  const registrationFields = identityFields.filter((f) => !f.multiline);
  const storyFields = identityFields.filter((f) => f.multiline);
  const missing = registrationFields.filter((f) => f.status === 'required').map((f) => f.label);
  const unconfirmed = registrationFields.filter((f) => f.status === 'inferred').map((f) => f.label);
  const missingStory = storyFields.filter((f) => f.status === 'required').map((f) => f.label);

  const supportingLines = supportingFacts
    .filter((f) => f.value && f.value !== 'Not yet provided')
    .map((f) => `- ${f.label}: ${f.value}`)
    .join('\n');

  const tasks: string[] = [];
  if (missing.length) {
    tasks.push(
      `These registration fields are still missing: ${missing.join(', ')}. For each, tell me exactly where I'd go get it (e.g. which government site, which document I should already have) — not a made-up value.`,
    );
  }
  if (unconfirmed.length) {
    tasks.push(
      `These fields are unconfirmed and may not exactly match my official registration: ${unconfirmed.join(', ')}. Tell me specifically what document I should check them against (e.g. Articles of Organization, my IRS EIN confirmation letter, my SAM.gov registration) so they match exactly.`,
    );
  }
  if (missingStory.length) {
    tasks.push(
      `${missingStory.join(', ')} isn't a registration fact to look up — draft it directly using the "supporting business context" above (not the identity facts): what the business does, who it serves, and why it matters. Ground it strictly in those facts; if there isn't enough there to write something specific and true, use a bracketed placeholder rather than inventing detail.`,
    );
  }
  tasks.push('Flag anything else above that looks like it might not hold up to that level of scrutiny.');

  return `I'm completing my business's official identity profile — the facts (and story) that federal grant applications, loan applications, and other formal submissions will draw from. Please do NOT invent or guess a specific value for anything below — only tell me where to find the real answer, what to double-check, or extract from the supporting context I've given you.

MY IDENTITY PROFILE (as currently on file):
${factLines}
${supportingLines ? `\nSUPPORTING BUSINESS CONTEXT (for drafting the Company Description only — not identity facts to verify):\n${supportingLines}\n` : ''}
WHAT I NEED HELP WITH:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}

interface SectionLike {
  label: string;
  guidance: string;
  prompt: string;
}

// Same purpose as buildOrgInfoPrompt above, for the Project Narrative instead — lets
// someone draft with whatever AI tool they prefer (or don't have Gemini access to this
// app's own generator) while keeping the same grounding rules this app's own AI features
// use: real facts only, bracketed placeholders instead of invented specifics.
export function buildNarrativePrompt(sections: SectionLike[], businessFacts: FactLike[], opportunity: OpportunityLike): string {
  const factLines = businessFacts
    .map((f) => {
      const tag = f.status === 'required' ? 'NOT PROVIDED — do not invent a value for this' : f.status === 'inferred' ? 'inferred, not owner-confirmed' : 'verified';
      return `- ${f.label}: ${f.value} [${tag}]`;
    })
    .join('\n');

  const sectionsBlock = sections
    .map((s) => `### ${s.label}\nWhat reviewers score: ${s.guidance}\nAnswer this: ${s.prompt}`)
    .join('\n\n');

  return `I'm drafting the Project Narrative for a federal/foundation grant application and want your help writing a strong first draft, which I'll review and edit before submitting anything.

MY BUSINESS FACTS — the ONLY source of truth about my business. Do not invent, assume, or embellish any name, number, date, or claim not listed here:
${factLines || '(no facts provided)'}

RULE: if a fact needed for a section is marked "NOT PROVIDED," don't invent a plausible-sounding value — write a clear bracketed placeholder instead (e.g. "[Add specific revenue figures once available]"), so I know exactly what I still need to fill in myself.

THE OPPORTUNITY I'm applying to:
Title: ${opportunity.title}
Funder: ${opportunity.funder}
Description: ${opportunity.description.slice(0, 2000)}
${opportunity.eligibilityNotes ? `Eligibility notes: ${opportunity.eligibilityNotes.slice(0, 500)}` : ''}

Please draft each of the following narrative sections — 2-4 focused paragraphs each, written in my voice ("we"), grounded strictly in the facts above. Label each section clearly so I can tell where one ends and the next begins:

${sectionsBlock}`;
}
