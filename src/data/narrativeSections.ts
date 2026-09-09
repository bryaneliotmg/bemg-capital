export interface NarrativeSectionDef {
  id: string;
  label: string;
  /** Why reviewers care about this section, and the most common way applicants lose points on it. */
  guidance: string;
  /** A concrete leading question to get past the blank page. */
  prompt: string;
}

// The near-universal shape of a competitive federal/foundation grant narrative —
// not specific to any one opportunity's published rubric (we don't have that data),
// but this structure and what each section is scored on is consistent across the
// vast majority of discretionary grant programs.
export const NARRATIVE_SECTIONS: NarrativeSectionDef[] = [
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
