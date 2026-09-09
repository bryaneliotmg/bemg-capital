const REPORTER_URL = 'https://api.reporter.nih.gov/v2/projects/search';

export interface ReporterAbstract {
  title: string;
  abstract: string;
  fiscalYear: number;
  org: string;
}

interface ReporterResult {
  project_title?: string;
  abstract_text?: string;
  fiscal_year?: number;
  org_name?: string;
}

// NIH activity codes are one letter + two digits (R01, R21, R41, R42, U01, K01, T32...)
// and NIH opportunity titles conventionally include the mechanism in parentheses,
// e.g. "(Parent STTR [R41/R42] Clinical Trial Optional)".
export function extractNihActivityCodes(title: string): string[] {
  const matches = title.match(/\b[A-Z]\d{2}\b/g) ?? [];
  return Array.from(new Set(matches));
}

/**
 * Fetches real funded-project abstracts from NIH RePORTER (public, free, no key)
 * for the given activity codes — used both as human-readable reference material
 * and as structural/stylistic grounding for narrative generation. Never used as a
 * source of facts about the applicant's own project.
 */
export async function fetchReporterAbstracts(activityCodes: string[], limit = 8): Promise<ReporterAbstract[]> {
  if (activityCodes.length === 0) return [];
  const res = await fetch(REPORTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      criteria: { activity_codes: activityCodes },
      include_fields: ['ProjectTitle', 'AbstractText', 'FiscalYear', 'OrgName'],
      limit,
      sort_field: 'fiscal_year',
      sort_order: 'desc',
    }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const results: ReporterResult[] = json?.results ?? [];
  return results
    .filter((r) => !!r.abstract_text)
    .map((r) => ({
      title: r.project_title ?? '',
      abstract: r.abstract_text ?? '',
      fiscalYear: r.fiscal_year ?? 0,
      org: r.org_name ?? '',
    }));
}
