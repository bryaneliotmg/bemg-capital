import { supabase } from './supabase';
import type { Application, OpportunityStatus, OpportunityType } from '../data/sampleData';

interface ApplicationRow {
  grant_id: string;
  name: string;
  opportunity_type: string;
  status: string;
  deadline: string;
}

interface NarrativeRow {
  grant_id: string;
  section_id: string;
  content: string;
}

export async function fetchApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('grant_id, name, opportunity_type, status, deadline');
  if (error) throw error;
  return (data ?? []).map((row: ApplicationRow) => ({
    grantId: row.grant_id,
    name: row.name,
    opportunityType: row.opportunity_type as OpportunityType,
    status: row.status as OpportunityStatus,
    deadline: row.deadline,
  }));
}

export async function insertApplication(app: Application, tenantId: string): Promise<void> {
  const { error } = await supabase.from('applications').insert({
    grant_id: app.grantId,
    name: app.name,
    opportunity_type: app.opportunityType,
    status: app.status,
    deadline: app.deadline,
    tenant_id: tenantId,
  });
  if (error) throw error;
}

export async function persistApplicationStatus(grantId: string, status: OpportunityStatus): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ status, updated_at: new Date().toISOString() })
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
