export interface NarrativeSectionDef {
  id: string;
  label: string;
  /** Why reviewers care about this section, and the most common way applicants lose points on it. */
  guidance: string;
  /** A concrete leading question to get past the blank page. */
  prompt: string;
}

// Generic fallback — the near-universal shape of a competitive federal/foundation
// grant narrative, for agencies whose specific published rubric we don't confidently
// know. NIH and NSF (below) have well-documented, stable rubrics we use instead.
export const GENERIC_SECTIONS: NarrativeSectionDef[] = [
  {
    id: 'need',
    label: 'Statement of Need',
    guidance:
      'Reviewers read this first and weight it heavily. State the problem clearly and back it with evidence — data, a specific example, your own firsthand experience — rather than just asserting it matters.',
    prompt: 'What problem or gap does this project address, and why does it matter right now?',
  },
  {
    id: 'approach',
    label: 'Project Description & Approach',
    guidance:
      "This is where a vague idea either becomes a credible plan or doesn't. Describe the specific activities in enough detail that a stranger could picture the work — general ambition reads as unprepared.",
    prompt: 'What will you actually do, step by step, if funded?',
  },
  {
    id: 'goals',
    label: 'Goals & Measurable Objectives',
    guidance:
      'Reviewers are trained to look for numbers. "Improve visibility" scores worse than "publish 150 posts and grow reach 30% in 12 months." Aim for 2–4 objectives you could actually report back on later.',
    prompt: 'What specific, measurable results will this funding produce?',
  },
  {
    id: 'capacity',
    label: 'Organizational Capacity',
    guidance:
      'Reviewers ask: can this applicant actually pull this off? Lean on your real track record — team, experience, prior outcomes — rather than generic claims of capability.',
    prompt: 'Why is your business positioned to deliver this successfully?',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    guidance:
      "A rough phase-by-phase timeline signals a thought-out plan more than any adjective could. It doesn't need to be exact — it needs to exist.",
    prompt: 'Break the project into phases or milestones with approximate dates.',
  },
  {
    id: 'budget',
    label: 'Budget Narrative',
    guidance:
      'Every dollar requested should map back to an activity described above. Reviewers check for reasonableness against the plan, not just a total — "because we need it" isn\'t a budget justification.',
    prompt: 'How will the requested funds be spent, item by item?',
  },
  {
    id: 'evaluation',
    label: 'Evaluation & Sustainability',
    guidance:
      'Two questions reviewers ask here: how will you know it worked, and what happens when the grant money runs out? Federal funders specifically penalize projects that look like permanent dependency.',
    prompt: 'How will you measure success, and how does this continue after the grant ends?',
  },
];

// NIH's five core review criteria — used for essentially every NIH grant mechanism
// (R01, R21, R41/R42 STTR, R43/R44 SBIR, etc.), publicly documented NIH review policy.
export const NIH_SECTIONS: NarrativeSectionDef[] = [
  {
    id: 'significance',
    label: 'Significance',
    guidance:
      "NIH's most heavily weighted criterion. Reviewers ask: does this address an important problem, and would success meaningfully move the field or improve health? Strong methodology can't rescue weak significance.",
    prompt: 'What critical problem does this address, and how would solving it change the field or improve outcomes?',
  },
  {
    id: 'innovation',
    label: 'Innovation',
    guidance:
      'NIH explicitly rewards challenging an existing paradigm or applying a novel concept/method — not just doing more of the same, better. Reviewers specifically look for what is genuinely new here.',
    prompt: 'What about your concept, approach, or methodology is genuinely novel — not just incrementally better?',
  },
  {
    id: 'approach',
    label: 'Approach',
    guidance:
      'The most heavily scrutinized section for feasibility. Reviewers check whether your specific aims, methodology, and analysis plan are rigorous, and whether you have anticipated likely pitfalls.',
    prompt: 'What are your specific aims, and exactly how will you execute and evaluate each one?',
  },
  {
    id: 'investigators',
    label: 'Investigator(s)',
    guidance:
      'Reviewers assess whether the specific people on this project — not the company in the abstract — are well-suited to it, based on training, track record, and role.',
    prompt: 'Who is doing this work, and what in their background makes them credible for it?',
  },
  {
    id: 'environment',
    label: 'Environment',
    guidance:
      "Does the applicant's organization provide the resources, facilities, and institutional support needed to actually execute this?",
    prompt: 'What resources, facilities, or institutional support do you have in place to carry this out?',
  },
];

export const NIH_COMMERCIAL_POTENTIAL_SECTION: NarrativeSectionDef = {
  id: 'commercial_potential',
  label: 'Commercial Potential',
  guidance:
    'Required specifically for SBIR/STTR mechanisms. NIH wants a credible path from this research to an actual product or service reaching the market — not just good science.',
  prompt: 'What is the commercial path from this project to a real product, and who would buy or use it?',
};

// NSF's two co-equal, explicitly-named review criteria — its own exact language,
// used by reviewers directly.
export const NSF_SECTIONS: NarrativeSectionDef[] = [
  {
    id: 'intellectual_merit',
    label: 'Intellectual Merit',
    guidance:
      "NSF's own exact phrase, and reviewers score against it directly. Ask: does this advance knowledge or understanding within or across fields?",
    prompt: 'How does this project advance knowledge or understanding in your field?',
  },
  {
    id: 'broader_impacts',
    label: 'Broader Impacts',
    guidance:
      "NSF's other co-equal criterion — often under-weighted by first-time applicants. Benefits to society, education, workforce, or the broader community count as much as the core science.",
    prompt: 'Beyond the direct technical results, who else benefits from this project, and how?',
  },
  GENERIC_SECTIONS[1], // Project Description & Approach
  GENERIC_SECTIONS[3], // Organizational Capacity
  GENERIC_SECTIONS[4], // Timeline
  GENERIC_SECTIONS[5], // Budget Narrative
];

export type RubricFamily = 'NIH' | 'NSF' | 'GENERIC';

export function detectRubricFamily(agencyCode: string | null | undefined): RubricFamily {
  const agency = (agencyCode ?? '').toUpperCase();
  if (agency.includes('NIH')) return 'NIH';
  if (agency.includes('NSF')) return 'NSF';
  return 'GENERIC';
}

function isSbirSttr(title: string): boolean {
  return /SBIR|STTR|\bR4[1-4]\b/i.test(title);
}

export function getNarrativeSections(agencyCode: string | null | undefined, title: string): NarrativeSectionDef[] {
  const family = detectRubricFamily(agencyCode);
  if (family === 'NIH') {
    return isSbirSttr(title) ? [...NIH_SECTIONS, NIH_COMMERCIAL_POTENTIAL_SECTION] : NIH_SECTIONS;
  }
  if (family === 'NSF') return NSF_SECTIONS;
  return GENERIC_SECTIONS;
}

export function getRubricLabel(agencyCode: string | null | undefined, title: string): string {
  const family = detectRubricFamily(agencyCode);
  if (family === 'NIH') {
    return isSbirSttr(title)
      ? "NIH's 5 core review criteria + Commercial Potential (SBIR/STTR)"
      : "NIH's 5 core review criteria (Significance, Innovation, Approach, Investigator(s), Environment)";
  }
  if (family === 'NSF') return "NSF's Intellectual Merit / Broader Impacts criteria";
  return 'Common structure across most federal/foundation grants — this program\'s specific rubric is not in our data';
}
