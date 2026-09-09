interface FactLike {
  label: string;
  value: string;
  status: string;
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
