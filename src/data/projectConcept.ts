import type { NarrativeSectionDef } from './narrativeSections';

// A fixed, non-rubric-dependent brainstorm — deliberately the SAME 4 questions for every
// grant, unlike narrativeSections.ts's rubric-specific sections. These mirror the
// highest-value generic sections (Statement of Need / Approach / Goals) but in plain,
// non-jargon language, so a first-time applicant can answer informally before ever
// seeing "Statement of Need" as a heading. AI drafting (api/generate-narrative.ts) then
// formalizes these answers into whatever structure this specific grant's rubric expects.
//
// Ids are namespaced with a "concept:" prefix so they never collide with a rubric's own
// section ids (e.g. GENERIC_SECTIONS already has an "approach" id) when both are stored
// in the same application_narratives table, keyed by (grant_id, section_id).
export const PROJECT_CONCEPT_SECTIONS: NarrativeSectionDef[] = [
  {
    id: 'concept:idea',
    label: "What's the idea?",
    guidance: 'The starting point for everything else — a plain-language description of what you want to do, not a formal proposal yet.',
    prompt: 'In your own words, what do you want to build, launch, or do with this money?',
  },
  {
    id: 'concept:problem',
    label: 'What problem does it solve?',
    guidance: "This becomes your Statement of Need. Reviewers want a real problem, backed by something concrete — not just an assertion that it matters.",
    prompt: 'What specific problem or gap does this address, and for whom?',
  },
  {
    id: 'concept:plan',
    label: 'What would you actually do?',
    guidance: 'This becomes your Approach section. Concrete steps read as a credible plan; vague ambition reads as unprepared.',
    prompt: 'What are the concrete steps or activities, if funded?',
  },
  {
    id: 'concept:outcome',
    label: 'What does success look like?',
    guidance: 'This becomes your Goals & Measurable Objectives. Even a rough number beats a vague adjective.',
    prompt: "What's the expected result in about a year — numbers if you have them, even rough ones?",
  },
];
