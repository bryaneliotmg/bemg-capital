import type { DnaField, EditableTabId } from '../data/sampleData';

export const STOPWORDS = new Set([
  // Common function words — includes short (4-letter) ones now that the minimum word
  // length below is 4, not 5, so genuinely meaningful short words like "arts" or "care"
  // aren't filtered out along with the noise.
  'their', 'which', 'been', 'also', 'such', 'than', 'they', 'them', 'these', 'those',
  'about', 'after', 'before', 'under', 'over', 'more', 'most', 'some', 'each', 'every',
  'other', 'only', 'when', 'where', 'while', 'through', 'include', 'including', 'shall',
  'should', 'would', 'could', 'within', 'without', 'with', 'have', 'will', 'this', 'that',
  'from', 'your', 'must', 'need', 'want', 'make', 'made', 'take', 'used', 'uses', 'work',
  'works', 'into', 'onto', 'upon', 'many', 'much', 'both', 'here', 'there', 'what', 'were',
  'well', 'good', 'like', 'just', 'very', 'able', 'part', 'ways', 'help', 'gets', 'give',

  // Grant-administration boilerplate — repeats across nearly every listing regardless
  // of subject matter, so it isn't a useful topical-alignment signal even though it's
  // frequent. Deliberately keeps domain/substance words (research, clinical, health,
  // technology, commercial, innovation, etc.) untouched.
  'applicant', 'applicants', 'application', 'applications', 'funding', 'opportunity',
  'program', 'programs', 'grant', 'grants', 'period', 'periods', 'provide', 'provides',
  'provided', 'providing', 'process', 'processes', 'national', 'institutes', 'institute',
  'receive', 'receives', 'received', 'receiving', 'review', 'reviews', 'reviewed',
  'require', 'requires', 'required', 'requirement', 'requirements', 'information',
  'additional', 'eligible', 'eligibility', 'activities', 'activity', 'specific',
  'individual', 'individuals', 'organization', 'organizations', 'support', 'supports',
  'supported', 'supporting', 'project', 'projects', 'public', 'private', 'federal',
  'government', 'office', 'department', 'agency', 'agencies', 'announcement',
  'announcements', 'submission', 'submissions', 'submit', 'submitted', 'submitting',
  'deadline', 'deadlines', 'award', 'awards', 'awarded', 'awarding', 'budget', 'budgets',
  'proposal', 'proposals', 'document', 'documents', 'guidelines', 'guidance', 'policy',
  'policies', 'section', 'sections', 'please', 'further', 'details', 'instructions',
  'instruction', 'based', 'current', 'currently', 'certain', 'various', 'general',
  'generally', 'relevant', 'related', 'regarding', 'necessary', 'appropriate', 'expected',
  'existing', 'ensure', 'ensuring', 'means', 'meaning', 'purpose', 'purposes', 'result',
  'results', 'resulting', 'level', 'levels', 'total', 'years', 'months', 'dates',
]);

export function extractKeywords(text: string, max = 25): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

// The DNA fields that actually describe what a business does and who it serves — the
// ones worth deriving grant-matching keywords from. Financial/registration facts
// (EIN, revenue, etc.) don't carry topical signal, so they're deliberately excluded.
// Tagline/Brand Positioning are included deliberately: for a tenant whose fuller
// profile (Industry, Business Model, etc.) isn't filled in yet, a real tagline may be
// the only genuine descriptive signal available — better to use it than match on nothing.
const PROFILE_LABELS = new Set([
  'Industry',
  'Company Description',
  'Products & Services',
  'Market',
  'Business Model',
  'Tagline',
  'Brand Positioning',
]);

// Replaces the old hardcoded BUSINESS_PROFILE_KEYWORDS (which only ever described
// bEMG itself) now that Business DNA is per-tenant — the exact same matching code in
// matching.ts genuinely serves any tenant's business now, based on what's actually
// true about them, rather than a single fixed keyword list.
export function deriveKeywordsFromDnaFields(fieldsByTab: Record<EditableTabId, DnaField[]>): string[] {
  const text = Object.values(fieldsByTab)
    .flat()
    .filter((f) => PROFILE_LABELS.has(f.label) && f.value !== 'Not yet provided' && f.value !== 'Not available')
    .map((f) => f.value)
    .join(' ');
  return extractKeywords(text, 20);
}
