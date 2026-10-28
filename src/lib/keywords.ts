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

  // Generic business/technology jargon — words like "systems" or "technology" show up
  // in virtually every federal program description regardless of domain (a plant-pest
  // survey system and a marketing automation system share nothing but the word), so
  // treating them as topical-alignment signal produces confident-looking false
  // positives. Real case that surfaced this: bEMG's Mission/Vision text (heavy on this
  // kind of language) scored an 85% match on a USDA plant-disease grant purely because
  // both mentioned "systems" and "technology" — zero actual relevance. Domain-specific
  // words (marketing, brand, entrepreneurs, underserved, website, etc.) are untouched.
  'systems', 'system', 'technology', 'technologies', 'infrastructure', 'resources',
  'resource', 'management', 'development', 'solutions', 'solution', 'innovative',
  'innovation', 'strategic', 'strategy', 'digital', 'goal', 'goals', 'available',

  // Words every small-business listing contains by definition. Real case: SBA's STEP
  // program scored 78% for bEMG with "business, small, businesses" as three of its five
  // "focus area" hits — 45 of its points came from the word "business" appearing on a
  // small-business grant site. Specific words (marketing, brand, etc.) still count.
  'business', 'businesses', 'small', 'company', 'companies',

  // Everyday verbs/adjectives from mission and vision prose. Real case: bEMG's profile
  // produced "become, actually, having, stronger, build, focus, owner, tools" as match
  // keywords, and "build"/"focus"/"tools" alone pushed Quantum Leap Challenge Institutes
  // and a coastal-wildlife program to 72-78% — they say nothing about what a business does.
  'become', 'becomes', 'actually', 'having', 'stronger', 'strong', 'build', 'builds',
  'building', 'focus', 'focused', 'focuses', 'tools', 'owner', 'owners', 'great', 'world',
  'long', 'term', 'helps', 'helping', 'grow', 'growth', 'simply', 'every', 'real', 'best',
  'need', 'needs', 'create', 'creating', 'ability', 'able', 'time', 'place', 'larger',
  // Ambiguous in grant text: "service" hits "Service-Disabled Veteran" and "Forest
  // Service", "lead" hits "lead applicant", "done" is from "done-for-you".
  'service', 'services', 'lead', 'leads', 'done',
]);

function countKeywords(text: string, counts: Map<string, number>, weight: number, exclude: Set<string>) {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  for (const w of words) {
    if (STOPWORDS.has(w) || exclude.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + weight);
  }
}

function topKeywords(counts: Map<string, number>, max: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

export function extractKeywords(text: string, max = 25): string[] {
  const counts = new Map<string, number>();
  countKeywords(text, counts, 1, new Set());
  return topKeywords(counts, max);
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
  'Mission Statement',
  'Vision / Long-Term Impact',
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
// The same raw profile text deriveKeywordsFromDnaFields() extracts keywords from —
// exposed separately so it can also be sent for one-time AI domain classification
// (see api/_lib/domainTaxonomy.ts) without duplicating the field-selection logic.
export function buildProfileText(fieldsByTab: Record<EditableTabId, DnaField[]>): string {
  return Object.values(fieldsByTab)
    .flat()
    .filter((f) => PROFILE_LABELS.has(f.label) && f.value !== 'Not yet provided' && f.value !== 'Not available')
    .map((f) => f.value)
    .join(' ');
}

// The short, factual "what we do" fields. Counted 3x so they outweigh mission/vision
// prose — real case: bEMG's several-hundred-word Vision paragraph drowned out its
// one-line Industry ("Brand Management, AI Consulting & Web Development"), so the
// keyword list described its aspirations instead of its actual work.
const CORE_LABELS = new Set(['Industry', 'Products & Services', 'Market', 'Business Model']);
const CORE_WEIGHT = 3;

// The business's own name and domain aren't topical signal — "bemg" was bEMG's #2
// keyword. Pulled from the DNA fields that hold them rather than guessed at.
const NAME_LABELS = new Set(['Legal Name', 'Website']);

const isProvided = (f: DnaField) => f.value !== 'Not yet provided' && f.value !== 'Not available';

export function deriveKeywordsFromDnaFields(fieldsByTab: Record<EditableTabId, DnaField[]>): string[] {
  const fields = Object.values(fieldsByTab).flat().filter(isProvided);
  const exclude = new Set(
    fields.filter((f) => NAME_LABELS.has(f.label)).flatMap((f) => f.value.toLowerCase().match(/[a-z]{4,}/g) ?? []),
  );
  const counts = new Map<string, number>();
  for (const f of fields) {
    if (!PROFILE_LABELS.has(f.label)) continue;
    countKeywords(f.value, counts, CORE_LABELS.has(f.label) ? CORE_WEIGHT : 1, exclude);
  }
  return topKeywords(counts, 20);
}
