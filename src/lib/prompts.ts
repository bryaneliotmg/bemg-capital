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

  const supportingLines = supportingFacts
    .filter((f) => f.value && f.value !== 'Not yet provided')
    .map((f) => `- ${f.label}: ${f.value}`)
    .join('\n');

  const businessName = identityFields.find((f) => f.label === 'Legal Name' && f.value !== 'Not yet provided')?.value ?? '[Business Name]';

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
  for (const story of storyFields) {
    const hasDraft = story.status !== 'required';
    tasks.push(
      `${story.label} isn't a registration fact to look up — it needs to read like a real grant-ready company profile, not marketing copy. ${
        hasDraft
          ? `Revise and restructure my current draft below into the exact format that follows, keeping anything already true and filling gaps from the supporting business context above.\n\nMY CURRENT DRAFT:\n${story.value}`
          : 'Using the supporting business context above, write it in the exact format that follows.'
      }\n\nCOMPANY PROFILE — ${businessName} (Grant-Ready)\n\nMISSION & THE PROBLEM WE ADDRESS\n2-3 sentences: the underlying gap or need this work responds to, not just what's sold — this is the single most heavily weighted thing a grant reviewer reads.\n\nOUR APPROACH\n2-3 sentences: the actual mechanism — what specifically happens that closes the gap above, specific enough to picture, not a category label.\n\nWHO WE SERVE & THE EVIDENCE SO FAR\n2-3 sentences: the specific population/market, and any real numbers or outcomes from the facts given that show this isn't theoretical.\n\nCAPABILITIES & TRACK RECORD\nBulleted list: each real capability or delivered product, one line on what it does and what it demonstrates about capacity to execute.\n\nWHAT MAKES THIS WORTH FUNDING\n2-3 sentences: the genuine reason this approach deserves investment over the status quo or alternatives — tied to something structural, not a marketing claim.\n\nQUESTIONS A GRANT REVIEWER TYPICALLY ASKS\n5 bulleted Q&As anticipating real due-diligence concerns (sustainability after funding ends, how success will be measured, why this organization specifically, financial/operational readiness, what happens if it doesn't work as planned) — answered honestly from the facts given.\n\nFUNDING FIT & READINESS\n2-3 sentences: what kind of funding or partnership fits this business at its current stage, and what's needed before a specific application could move forward.\n\nGround every section strictly in the facts given above; use a bracketed placeholder for anything not established rather than inventing detail.`,
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
