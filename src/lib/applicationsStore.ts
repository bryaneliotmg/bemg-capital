import { supabase } from './supabase';
import type { Application, OpportunityStatus, OpportunityType, OrgInfoField } from '../data/sampleData';

interface ApplicationRow {
  grant_id: string;
  name: string;
  opportunity_type: string;
  status: string;
  outcome_reason: string | null;
  alignment_score: number | null;
  alignment_computed_at: string | null;
  deadline: string;
  org_info: Record<string, OrgInfoField> | null;
}

interface NarrativeRow {
  grant_id: string;
  section_id: string;
  content: string;
}

export async function fetchApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('grant_id, name, opportunity_type, status, outcome_reason, alignment_score, alignment_computed_at, deadline, org_info');
  if (error) throw error;
  return (data ?? []).map((row: ApplicationRow) => ({
    grantId: row.grant_id,
    name: row.name,
    opportunityType: row.opportunity_type as OpportunityType,
    status: row.status as OpportunityStatus,
    outcomeReason: row.outcome_reason,
    alignmentScore: row.alignment_score,
    alignmentComputedAt: row.alignment_computed_at,
    deadline: row.deadline,
    orgInfo: row.org_info ?? {},
  }));
}

export async function insertApplication(app: Application, tenantId: string): Promise<void> {
  const { error } = await supabase.from('applications').insert({
    grant_id: app.grantId,
    name: app.name,
    opportunity_type: app.opportunityType,
    status: app.status,
    deadline: app.deadline,
    org_info: app.orgInfo,
    tenant_id: tenantId,
  });
  if (error) throw error;
}

export async function persistApplicationStatus(
  grantId: string,
  status: OpportunityStatus,
  outcomeReason?: string | null,
): Promise<void> {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (outcomeReason !== undefined) update.outcome_reason = outcomeReason;
  const { error } = await supabase.from('applications').update(update).eq('grant_id', grantId);
  if (error) throw error;
}

export async function persistAlignmentScore(grantId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ alignment_score: score, alignment_computed_at: new Date().toISOString() })
    .eq('grant_id', grantId);
  if (error) throw error;
}

export async function persistOrgInfo(grantId: string, orgInfo: Record<string, OrgInfoField>): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ org_info: orgInfo, updated_at: new Date().toISOString() })
    .eq('grant_id', grantId);
  if (error) throw error;
}

export async function fetchNarratives(): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await supabase.from('application_narratives').select('grant_id, section_id, content');
  if (error) throw error;
  const byGrant: Record<string, Record<string, string>> = {};
  for (const row of (data ?? []) as NarrativeRow[]) {
    byGrant[row.grant_id] = byGrant[row.grant_id] ?? {};
    byGrant[row.grant_id][row.section_id] = row.content;
  }
  return byGrant;
}

export async function persistNarrativeSection(
  grantId: string,
  sectionId: string,
  content: string,
  tenantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('application_narratives')
    .upsert(
      { grant_id: grantId, section_id: sectionId, content, tenant_id: tenantId, updated_at: new Date().toISOString() },
      { onConflict: 'grant_id,section_id' },
    );
  if (error) throw error;
}

export async function persistNarrativeBulk(
  grantId: string,
  sections: Record<string, string>,
  tenantId: string,
): Promise<void> {
  const rows = Object.entries(sections).map(([sectionId, content]) => ({
    grant_id: grantId,
    section_id: sectionId,
    content,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('application_narratives').upsert(rows, { onConflict: 'grant_id,section_id' });
  if (error) throw error;
}
