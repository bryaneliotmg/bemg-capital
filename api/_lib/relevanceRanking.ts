import type { SupabaseClient } from '@supabase/supabase-js';
import { matchOpportunity, type RawFundingOpportunity, type BusinessProfile } from '../../src/lib/matching.js';
import { deriveKeywordsFromDnaFields } from '../../src/lib/keywords.js';
import type { DnaField, EditableTabId } from '../../src/data/sampleData.js';

const EDITABLE_TABS: EditableTabId[] = ['identity', 'financial', 'operating', 'growth', 'funding'];

function emptyFieldsByTab(): Record<EditableTabId, DnaField[]> {
  return { identity: [], financial: [], operating: [], growth: [], funding: [] };
}

/** Builds a keyword-only BusinessProfile per real tenant, straight from their live
 * Business DNA — the same input deriveKeywordsFromDnaFields() uses in the browser
 * (see OpportunitiesContext.tsx), just read directly here since this runs server-side
 * with no React context available. */
async function loadTenantProfiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<BusinessProfile[]> {
  const { data, error } = await supabase
    .from('business_dna_fields')
    .select('tenant_id, tab, label, value, status, source_label');
  if (error || !data) return [];

  const byTenant = new Map<string, Record<EditableTabId, DnaField[]>>();
  for (const row of data) {
    if (!byTenant.has(row.tenant_id)) byTenant.set(row.tenant_id, emptyFieldsByTab());
    const fieldsByTab = byTenant.get(row.tenant_id)!;
    const tab = row.tab as EditableTabId;
    if (!EDITABLE_TABS.includes(tab)) continue;
    fieldsByTab[tab].push({
      label: row.label,
      value: row.value,
      status: row.status,
      sourceLabel: row.source_label ?? '',
    });
  }

  return [...byTenant.values()]
    .map((fieldsByTab) => ({ keywords: deriveKeywordsFromDnaFields(fieldsByTab) }))
    .filter((profile) => profile.keywords.length > 0);
}

/**
 * Orders a set of not-yet-classified opportunity IDs by how relevant they already look
 * to bEMG Capital's real tenants (via the same keyword-overlap scoring used at browse
 * time — see matchOpportunity() in src/lib/matching.ts), highest first. Used to decide
 * which handful of the historical backlog gets today's limited classification calls
 * (see api/backfill-domains.ts): with a free-tier Gemini key capped at ~20
 * classifications/day, the grants tenants are actually seeing near the top of their
 * results right now should get a verified domain/geography check before ones nobody's
 * looking at. Best-effort — falls back to the input order untouched if tenant profiles
 * or opportunity data can't be loaded, since this is a prioritization nicety, not
 * something that should block the backfill from running at all.
 */
export async function rankByTenantRelevance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return ids;

  try {
    const [profiles, oppRows] = await Promise.all([
      loadTenantProfiles(supabase),
      supabase
        .from('funding_opportunities')
        .select('id, source, title, description, status, eligibility_codes, award_ceiling, award_floor')
        .in('id', ids),
    ]);

    if (profiles.length === 0 || oppRows.error || !oppRows.data) return ids;

    const scored = oppRows.data.map((row) => {
      const raw: RawFundingOpportunity = {
        id: row.id,
        source: row.source,
        opportunity_number: null,
        title: row.title,
        agency_name: null,
        agency_code: null,
        cfda_list: null,
        doc_type: null,
        status: row.status,
        open_date: null,
        close_date: null,
        award_floor: row.award_floor,
        award_ceiling: row.award_ceiling,
        eligibility_codes: row.eligibility_codes,
        description: row.description,
        announcement_url: null,
        applicant_eligibility_desc: null,
        funding_categories: null,
        agency_contact_name: null,
        agency_contact_email: null,
        agency_contact_phone: null,
        primary_domain: null,
        eligible_states: null,
      };
      const maxScore = Math.max(...profiles.map((profile) => matchOpportunity(raw, profile).matchPct), 0);
      return { id: row.id, maxScore };
    });

    scored.sort((a, b) => b.maxScore - a.maxScore);
    const rankedIds = scored.map((s) => s.id);
    // Any input id the query didn't return (shouldn't normally happen) still gets
    // classified eventually — appended at the end rather than silently dropped.
    const missing = ids.filter((id) => !rankedIds.includes(id));
    return [...rankedIds, ...missing];
  } catch {
    return ids;
  }
}
